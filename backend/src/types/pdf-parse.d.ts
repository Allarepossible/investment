declare module 'pdf-parse' {
    type PdfParseResult = {
        numpages: number;
        text: string;
    };

    export default function pdf(buffer: Buffer): Promise<PdfParseResult>;
}
