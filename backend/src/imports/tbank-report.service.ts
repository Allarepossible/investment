import pdf from 'pdf-parse';
import { inArray } from 'drizzle-orm';
import { calculatePortfolioTotals, type PortfolioTransaction } from '../analytics/portfolio.analytics';
import { db } from '../db';
import { instruments, transactions } from '../db/schema';
import { addInstrument } from '../instruments/instrument.service';
import { getPortfolio } from '../portfolios/portfolio.service';
import {
    listTransactions,
    parseTransactionInput,
    type TransactionInput,
} from '../transactions/transaction.service';

type ImportedTradeType = 'BUY' | 'SELL';
type ImportedCashType = 'DEPOSIT' | 'WITHDRAWAL';

export type BrokerReportOperation = {
    type: ImportedTradeType | ImportedCashType;
    ticker: string | null;
    quantity: number | null;
    priceKopecks: number | null;
    amountKopecks: number | null;
    accruedInterestKopecks: number;
    commissionKopecks: number;
    operationDate: string;
    sourceId: string;
    description: string;
};

export type BrokerReportPreview = {
    broker: 'Т-Банк';
    period: string | null;
    operations: BrokerReportOperation[];
    warnings: string[];
    summary: {
        trades: number;
        deposits: number;
        withdrawals: number;
        commissionsKopecks: number;
    };
};

export class BrokerReportImportError extends Error {}

const MAX_PDF_SIZE = 8 * 1024 * 1024;
const datePattern = /^\d{2}\.\d{2}\.\d{4}$/;
const tickerPattern = /^(?:SU[A-Z0-9]{7,}|[A-Z][A-Z0-9._-]{1,15})$/;

function cleanLines(text: string) {
    return text
        .replace(/\r/g, '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
}

function toIsoDate(value: string) {
    const [day, month, year] = value.split('.');
    if (!day || !month || !year) throw new BrokerReportImportError(`Не удалось прочитать дату ${value}`);
    return `${year}-${month}-${day}`;
}

function moneyToKopecks(value: string) {
    const normalized = value.replace(/\s/g, '').replace(/,/g, '');
    if (!/^\d+(?:\.\d{2})?$/.test(normalized)) {
        throw new BrokerReportImportError(`Не удалось прочитать денежную сумму ${value}`);
    }
    const kopecks = Math.round(Number(normalized) * 100);
    if (!Number.isSafeInteger(kopecks)) throw new BrokerReportImportError('Сумма в отчёте слишком велика');
    return kopecks;
}

function isCompleteMoney(value: string) {
    return /^\d[\d,]*\.\d{2}$/.test(value);
}

function readMoney(lines: string[], start: number) {
    let value = '';
    let index = start;
    while (index < lines.length && /^\d[\d,.]*$/.test(lines[index])) {
        value += lines[index];
        index += 1;
        if (isCompleteMoney(value)) return { value, next: index };
    }
    throw new BrokerReportImportError('В строке сделки не найдена полная денежная сумма');
}

function readQuantity(lines: string[], start: number) {
    let value = '';
    let index = start;
    while (index < lines.length && /^\d[\d.]*$/.test(lines[index])) {
        value += lines[index];
        index += 1;
        if (/^\d+(?:\.\d{2})?$/.test(value)) {
            return { value: Number(value), next: index };
        }
    }
    throw new BrokerReportImportError('В строке сделки не указано количество бумаг');
}

function sectionBetween(text: string, start: string, end: string) {
    const startIndex = text.indexOf(start);
    if (startIndex === -1) return '';
    const endIndex = text.indexOf(end, startIndex + start.length);
    return text.slice(startIndex, endIndex === -1 ? undefined : endIndex);
}

function parseExecutedTrades(text: string, warnings: string[]): BrokerReportOperation[] {
    const sectionStart = text.match(/1\.1 Информация о (?:совершенных|заключенных) и исполненных сделках[^\n]*/)?.[0];
    const section = sectionStart
        ? sectionBetween(text, sectionStart, '1.2 Информация о неисполненных сделках')
        : '';
    if (!section) {
        warnings.push('Раздел исполненных сделок (1.1) не найден.');
        return [];
    }

    const lines = cleanLines(section);
    const operations: BrokerReportOperation[] = [];

    for (let index = 0; index < lines.length; index += 1) {
        const tradeId = lines[index];
        if (!/^\d{11}$/.test(tradeId) || /^\d{11}$/.test(lines[index - 1] ?? '')) continue;

        try {
            let cursor = index + 1;
            if (!/^\d{11}$/.test(lines[cursor] ?? '')) throw new Error('номер поручения не найден');
            cursor += 1;
            const date = lines[cursor];
            if (!datePattern.test(date ?? '')) throw new Error('дата сделки не найдена');
            cursor += 1;
            if (/^\d{2}:\d{2}:\d{2}$/.test(lines[cursor] ?? '')) cursor += 1;
            cursor += 1; // Площадка: ММВБ / СПБ
            const direction = lines[cursor];
            if (direction !== 'Покупка' && direction !== 'Продажа') throw new Error('направление сделки не найдено');
            cursor += 1;

            const nameStart = cursor;
            while (cursor < lines.length && !tickerPattern.test(lines[cursor])) cursor += 1;
            const ticker = lines[cursor];
            if (!ticker || cursor === nameStart || ticker === 'RUB') throw new Error('тикер не найден');
            const description = lines.slice(nameStart, cursor).join(' ');
            cursor += 1;

            const price = readMoney(lines, cursor);
            cursor = price.next;
            if (lines[cursor] !== 'RUB' && lines[cursor] !== '%') throw new Error('валюта цены не найдена');
            cursor += 1;
            const quantity = readQuantity(lines, cursor);
            cursor = quantity.next;
            const gross = readMoney(lines, cursor);
            cursor = gross.next;
            const accruedInterest = readMoney(lines, cursor);
            cursor = accruedInterest.next;
            const settlement = readMoney(lines, cursor);
            cursor = settlement.next;
            if (lines[cursor] !== 'RUB') throw new Error('валюта расчёта не найдена');
            cursor += 1;
            const brokerCommission = readMoney(lines, cursor);
            cursor = brokerCommission.next;
            if (lines[cursor] !== 'RUB') throw new Error('валюта брокерской комиссии не найдена');
            cursor += 1;
            const exchangeCommission = readMoney(lines, cursor);
            cursor = exchangeCommission.next;
            if (lines[cursor] !== 'RUB') throw new Error('валюта биржевой комиссии не найдена');
            cursor += 1;
            const clearingCommission = readMoney(lines, cursor);

            const grossKopecks = moneyToKopecks(gross.value);
            const quantityValue = quantity.value;
            if (!Number.isInteger(quantityValue) || quantityValue < 1) {
                throw new Error('количество должно быть целым и больше нуля');
            }

            operations.push({
                type: direction === 'Покупка' ? 'BUY' : 'SELL',
                ticker,
                quantity: quantityValue,
                priceKopecks: Math.round(grossKopecks / quantityValue),
                amountKopecks: null,
                accruedInterestKopecks: moneyToKopecks(accruedInterest.value),
                commissionKopecks:
                    moneyToKopecks(brokerCommission.value)
                    + moneyToKopecks(exchangeCommission.value)
                    + moneyToKopecks(clearingCommission.value),
                operationDate: toIsoDate(date),
                sourceId: `tbank:trade:${tradeId}`,
                description: `${direction}: ${description}`,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'неизвестная ошибка';
            warnings.push(`Сделка №${tradeId} не распознана: ${message}.`);
        }
    }

    return operations;
}

function parseCashOperations(text: string, warnings: string[]): BrokerReportOperation[] {
    const section = sectionBetween(text, '2. Операции с денежными средствами', '3.1 Информация о движении ценных бумаг');
    if (!section) {
        warnings.push('Раздел денежных операций (2) не найден.');
        return [];
    }

    const operations: BrokerReportOperation[] = [];
    const expression = /(\d{2}\.\d{2}\.\d{4})\s+(?:\d{2}:\d{2}:\d{2}\s+)?\d{2}\.\d{2}\.\d{4}\s+(Пополнение счета|Вывод средств)\s+([\d,]+\.\d{2})\s+0\.00/g;
    let match: RegExpExecArray | null;
    while ((match = expression.exec(section))) {
        const [, date, action, amount] = match;
        try {
            operations.push({
                type: action === 'Пополнение счета' ? 'DEPOSIT' : 'WITHDRAWAL',
                ticker: null,
                quantity: null,
                priceKopecks: null,
                amountKopecks: moneyToKopecks(amount),
                accruedInterestKopecks: 0,
                commissionKopecks: 0,
                operationDate: toIsoDate(date),
                sourceId: `tbank:cash:${match.index}:${date}:${amount}`,
                description: action,
            });
        } catch {
            warnings.push(`Денежная операция от ${date} не распознана.`);
        }
    }
    return operations;
}

export async function previewTbankBrokerReport(pdfBase64: unknown): Promise<BrokerReportPreview> {
    if (typeof pdfBase64 !== 'string' || !pdfBase64.trim()) {
        throw new BrokerReportImportError('Загрузите PDF-файл отчёта.');
    }

    const buffer = Buffer.from(pdfBase64, 'base64');
    if (!buffer.length || buffer.length > MAX_PDF_SIZE || !buffer.subarray(0, 4).equals(Buffer.from('%PDF'))) {
        throw new BrokerReportImportError('Нужен PDF-файл отчёта размером до 8 МБ.');
    }

    let text: string;
    try {
        text = (await pdf(buffer)).text;
    } catch {
        throw new BrokerReportImportError('Не удалось прочитать текст PDF. Проверьте, что это обычный PDF, а не скан.');
    }
    if (!/Т\s*-?\s*Банк|Тинькофф/i.test(text)) {
        throw new BrokerReportImportError('Сейчас поддерживается отчёт Т-Банка в формате примера.');
    }

    const warnings: string[] = [];
    const operations = [
        ...parseExecutedTrades(text, warnings),
        ...parseCashOperations(text, warnings),
    ].sort((left, right) => left.operationDate.localeCompare(right.operationDate) || left.sourceId.localeCompare(right.sourceId));

    if (text.includes('1.2 Информация о неисполненных сделках')) {
        warnings.push('Запланированные и неисполненные сделки из раздела 1.2 не импортируются.');
    }
    if (!operations.length) warnings.push('В отчёте не найдено операций для импорта.');

    const period = text.match(/Отчет о сделках и операциях за период\s+(\d{2}\.\d{2}\.\d{4}\s*-\s*\d{2}\.\d{2}\.\d{4})/)?.[1] ?? null;
    return {
        broker: 'Т-Банк',
        period,
        operations,
        warnings,
        summary: {
            trades: operations.filter((operation) => operation.type === 'BUY' || operation.type === 'SELL').length,
            deposits: operations.filter((operation) => operation.type === 'DEPOSIT').length,
            withdrawals: operations.filter((operation) => operation.type === 'WITHDRAWAL').length,
            commissionsKopecks: operations.reduce((total, operation) => total + operation.commissionKopecks, 0),
        },
    };
}

async function getImportedTransactionInputs(portfolioId: number, operations: BrokerReportOperation[]) {
    const tickers = [...new Set(operations.flatMap((operation) => operation.ticker ? [operation.ticker] : []))];
    const importedInstruments = await Promise.allSettled(tickers.map((ticker) => addInstrument(ticker)));
    const unavailableTickers = importedInstruments.flatMap((result, index) =>
        result.status === 'rejected' ? [tickers[index]] : [],
    );
    if (unavailableTickers.length) {
        throw new BrokerReportImportError(
            `Не удалось получить данные MOEX для: ${unavailableTickers.join(', ')}. `
            + 'Снимите отметку с этих операций или повторите импорт позже.',
        );
    }

    const savedInstruments = tickers.length
        ? await db.select().from(instruments).where(inArray(instruments.ticker, tickers))
        : [];
    const instrumentIds = new Map(savedInstruments.map((instrument) => [instrument.ticker, instrument.id]));

    return operations.map((operation) => parseTransactionInput({
        portfolioId,
        type: operation.type,
        instrumentId: operation.ticker ? instrumentIds.get(operation.ticker) : null,
        quantity: operation.quantity,
        priceKopecks: operation.priceKopecks,
        amountKopecks: operation.amountKopecks,
        accruedInterestKopecks: operation.accruedInterestKopecks,
        commissionKopecks: operation.commissionKopecks,
        operationDate: operation.operationDate,
        comment: `Импорт Т-Банк: ${operation.description}`,
        sourceId: operation.sourceId,
    }));
}

function toPortfolioTransaction(
    input: TransactionInput,
    id: number,
    instrumentById: Map<number, { ticker: string; name: string }>,
): PortfolioTransaction {
    const instrument = input.instrumentId ? instrumentById.get(input.instrumentId) : null;
    return {
        id,
        portfolioId: input.portfolioId,
        instrumentId: input.instrumentId,
        ticker: instrument?.ticker ?? null,
        name: instrument?.name ?? null,
        type: input.type,
        quantity: input.quantity,
        priceKopecks: input.priceKopecks,
        amountKopecks: input.amountKopecks,
        accruedInterestKopecks: input.accruedInterestKopecks,
        commissionKopecks: input.commissionKopecks,
        operationDate: input.operationDate,
    };
}

function getSelectedOperations(preview: BrokerReportPreview, sourceIds: unknown) {
    if (!Array.isArray(sourceIds) || sourceIds.length < 1 || sourceIds.length > 500) {
        throw new BrokerReportImportError('Отметьте хотя бы одну операцию для импорта.');
    }
    if (!sourceIds.every((sourceId) => typeof sourceId === 'string' && sourceId.length <= 250)) {
        throw new BrokerReportImportError('Некорректный список операций для импорта.');
    }

    const selectedIds = new Set(sourceIds);
    if (selectedIds.size !== sourceIds.length) {
        throw new BrokerReportImportError('Операции для импорта не должны повторяться.');
    }

    const operations = preview.operations.filter((operation) => selectedIds.has(operation.sourceId));
    if (operations.length !== selectedIds.size) {
        throw new BrokerReportImportError('Часть выбранных операций не найдена в этом отчёте. Обновите предпросмотр.');
    }
    return operations;
}

export async function importTbankBrokerReport(
    portfolioId: number,
    pdfBase64: unknown,
    selectedSourceIds: unknown,
) {
    if (!Number.isSafeInteger(portfolioId) || portfolioId < 1) {
        throw new BrokerReportImportError('Выберите портфель для импорта.');
    }
    await getPortfolio(portfolioId);

    const preview = await previewTbankBrokerReport(pdfBase64);
    if (!preview.operations.length) throw new BrokerReportImportError('В отчёте нет операций для импорта.');

    const selectedOperations = getSelectedOperations(preview, selectedSourceIds);
    const sourceIds = selectedOperations.map((operation) => operation.sourceId);
    const existingSources = await db
        .select({ sourceId: transactions.sourceId })
        .from(transactions)
        .where(inArray(transactions.sourceId, sourceIds));
    if (existingSources.length) {
        throw new BrokerReportImportError('Среди выбранных операций есть уже импортированные. Снимите отметку с них и попробуйте снова.');
    }

    const inputs = await getImportedTransactionInputs(portfolioId, selectedOperations);
    const allInstruments = await db.select({ id: instruments.id, ticker: instruments.ticker, name: instruments.name }).from(instruments);
    const instrumentById = new Map(allInstruments.map((instrument) => [instrument.id, instrument]));
    const existingTransactions = await listTransactions(portfolioId);
    calculatePortfolioTotals([
        ...existingTransactions.map((transaction) => ({ ...transaction, accruedInterestKopecks: transaction.accruedInterestKopecks })),
        ...inputs.map((input, index) => toPortfolioTransaction(input, -index - 1, instrumentById)),
    ]);

    const createdAt = new Date();
    const imported = db.transaction((transactionDb) => transactionDb
        .insert(transactions)
        .values(inputs.map((input) => ({ ...input, createdAt })))
        .returning()
        .all());

    return {
        imported: imported.length,
        selectedSourceIds: sourceIds,
    };
}
