
import React, { useState } from 'react';
import { Database, Server, Component, Layers, BookOpen, Shield, FileJson } from 'lucide-react';

const DeveloperDocs = () => {
  const [activeTab, setActiveTab] = useState<'schema' | 'api' | 'components' | 'flows'>('schema');

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 text-white flex-shrink-0 hidden md:block">
        <div className="p-6">
          <h1 className="text-xl font-bold">Geezle Dev</h1>
          <p className="text-xs text-gray-400 mt-1">Platform Documentation</p>
        </div>
        <nav className="mt-6">
          <button onClick={() => setActiveTab('schema')} className={`w-full flex items-center px-6 py-3 hover:bg-gray-800 transition ${activeTab === 'schema' ? 'bg-gray-800 border-l-4 border-blue-500' : ''}`}>
            <Database className="w-5 h-5 mr-3 text-gray-400" /> Database Schema
          </button>
          <button onClick={() => setActiveTab('api')} className={`w-full flex items-center px-6 py-3 hover:bg-gray-800 transition ${activeTab === 'api' ? 'bg-gray-800 border-l-4 border-blue-500' : ''}`}>
            <Server className="w-5 h-5 mr-3 text-gray-400" /> API Spec
          </button>
          <button onClick={() => setActiveTab('components')} className={`w-full flex items-center px-6 py-3 hover:bg-gray-800 transition ${activeTab === 'components' ? 'bg-gray-800 border-l-4 border-blue-500' : ''}`}>
            <Component className="w-5 h-5 mr-3 text-gray-400" /> Components
          </button>
          <button onClick={() => setActiveTab('flows')} className={`w-full flex items-center px-6 py-3 hover:bg-gray-800 transition ${activeTab === 'flows' ? 'bg-gray-800 border-l-4 border-blue-500' : ''}`}>
            <Layers className="w-5 h-5 mr-3 text-gray-400" /> User Flows
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-5xl mx-auto">
          {activeTab === 'schema' && (
            <div className="space-y-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">PostgreSQL Schema</h2>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                  <h3 className="font-bold text-gray-700">schema.sql</h3>
                  <button className="text-sm text-blue-600 hover:underline flex items-center"><BookOpen className="w-4 h-4 mr-1" /> Copy SQL</button>
                </div>
                <pre className="p-6 bg-gray-800 text-green-400 font-mono text-sm overflow-x-auto">
{`-- USERS & AUTH --
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('freelancer', 'employer', 'admin')),
  kyc_status VARCHAR(50) DEFAULT 'none',
  created_at TIMESTAMP DEFAULT NOW()
);

-- PROFILES --
CREATE TABLE freelancer_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  title VARCHAR(255),
  hourly_rate DECIMAL(10, 2),
  availability_status VARCHAR(50) DEFAULT 'available',
  intro_video_url TEXT
);

-- TRANSACTIONS & ESCROW --
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  amount DECIMAL(10, 2) NOT NULL,
  type VARCHAR(50) NOT NULL, 
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);`}
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'api' && (
            <div className="space-y-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">API Specification</h2>
              <div className="grid gap-6">
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="px-3 py-1 bg-green-100 text-green-800 rounded text-xs font-bold font-mono">GET</span>
                    <span className="font-mono text-sm text-gray-700">/api/v1/users/me</span>
                  </div>
                  <p className="text-sm text-gray-600">Retrieves current authenticated user profile.</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded text-xs font-bold font-mono">POST</span>
                    <span className="font-mono text-sm text-gray-700">/api/v1/kyc/submit</span>
                  </div>
                  <p className="text-sm text-gray-600">Submit identity documents. Payload: FormData.</p>
                </div>
              </div>
            </div>
          )}
          {/* Add components and flows sections similarly if needed */}
        </div>
      </div>
    </div>
  );
};

export default DeveloperDocs;
