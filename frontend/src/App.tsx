import { useEffect, useState } from 'react';

function App() {
  const [status, setStatus] = useState('loading...');

  useEffect(() => {
    fetch('http://localhost:3000/api/health')
        .then((response) => response.json())
        .then((data) => {
          setStatus(data.status);
        })
        .catch(() => {
          setStatus('error');
        });
  }, []);

  return (
      <div>
        <h1>Portfolio Analytics</h1>

        <p>
          Backend status: {status}
        </p>
      </div>
  );
}

export default App;