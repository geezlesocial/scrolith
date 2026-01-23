import { useState, useEffect } from 'react';
import { Wifi, WifiOff, CheckCircle, XCircle } from 'lucide-react';

export default function TestConnection() {
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [backendData, setBackendData] = useState<any>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    testBackendConnection();
  }, []);

  const testBackendConnection = async () => {
    try {
      const response = await fetch('/api/test-connection');
      if (response.ok) {
        const data = await response.json();
        setBackendData(data);
        setBackendStatus('connected');
      } else {
        setBackendStatus('error');
        setError(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (err: any) {
      setBackendStatus('error');
      setError(err.message || 'Failed to connect');
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md max-w-md mx-auto mt-8">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        {backendStatus === 'checking' && <Wifi className="w-5 h-5 animate-pulse text-yellow-500" />}
        {backendStatus === 'connected' && <CheckCircle className="w-5 h-5 text-green-500" />}
        {backendStatus === 'error' && <XCircle className="w-5 h-5 text-red-500" />}
        System Connection Test
      </h2>
      
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="font-medium">Frontend:</span>
          <span className="text-green-600 font-bold">✅ Running</span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="font-medium">Backend API:</span>
          {backendStatus === 'checking' && (
            <span className="text-yellow-600 animate-pulse">Checking...</span>
          )}
          {backendStatus === 'connected' && (
            <span className="text-green-600 font-bold">✅ Connected</span>
          )}
          {backendStatus === 'error' && (
            <span className="text-red-600 font-bold">❌ Error</span>
          )}
        </div>

        {backendStatus === 'connected' && backendData && (
          <div className="mt-4 p-3 bg-green-50 rounded border border-green-200">
            <p className="text-sm text-green-800">
              <strong>Message:</strong> {backendData.message}
            </p>
            <p className="text-sm text-green-800 mt-1">
              <strong>Time:</strong> {new Date(backendData.timestamp).toLocaleTimeString()}
            </p>
          </div>
        )}

        {backendStatus === 'error' && (
          <div className="mt-4 p-3 bg-red-50 rounded border border-red-200">
            <p className="text-sm text-red-800">
              <strong>Error:</strong> {error}
            </p>
            <p className="text-sm text-red-800 mt-2">
              Make sure the backend server is running on port 5000
            </p>
          </div>
        )}

        <button
          onClick={testBackendConnection}
          className="w-full mt-4 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition"
        >
          Test Connection Again
        </button>
      </div>
    </div>
  );
}