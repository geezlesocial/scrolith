import React, { Suspense, useState } from 'react';
import { Activity, AlertOctagon, Brain, Gavel, ShieldAlert, TrendingUp, UserX, Zap } from 'lucide-react';

type Tab = 'overview' | 'fraud' | 'churn' | 'forecast' | 'optimize' | 'governance' | 'anomaly';

type TabButtonProps = {
  id: Tab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  onPreload: (tab: Tab) => void;
};

type LazySectionMap = Record<Tab, React.LazyExoticComponent<React.ComponentType<any>>>;
type SectionLoaderMap = Record<Tab, () => Promise<{ default: React.ComponentType<any> }>>;

const sectionLoaders: SectionLoaderMap = {
  overview: () => import('./ai-intelligence/AIOverviewSection'),
  fraud: () => import('./ai-intelligence/FraudGuardSection'),
  governance: () => import('./ai-intelligence/GovernancePanelSection'),
  churn: () => import('./ai-intelligence/ChurnPredictionSection'),
  forecast: () => import('./ai-intelligence/GrowthForecasterSection'),
  optimize: () => import('./ai-intelligence/AutoOptimizerSection'),
  anomaly: () => import('./ai-intelligence/AnomalyMonitorSection')
};

const sections: LazySectionMap = {
  overview: React.lazy(sectionLoaders.overview),
  fraud: React.lazy(sectionLoaders.fraud),
  governance: React.lazy(sectionLoaders.governance),
  churn: React.lazy(sectionLoaders.churn),
  forecast: React.lazy(sectionLoaders.forecast),
  optimize: React.lazy(sectionLoaders.optimize),
  anomaly: React.lazy(sectionLoaders.anomaly)
};

const AISectionLoader = () => (
  <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading AI module...</div>
);

const TabButton: React.FC<TabButtonProps> = ({ id, label, icon: Icon, activeTab, setActiveTab, onPreload }) => (
  <button
    onClick={() => setActiveTab(id)}
    onMouseEnter={() => onPreload(id)}
    onFocus={() => onPreload(id)}
    className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-all ${
      activeTab === id ? 'bg-white text-indigo-600 shadow' : 'text-gray-600 hover:bg-gray-200'
    }`}
  >
    <span className="flex items-center">
      <Icon className="mr-2 h-4 w-4" /> {label}
    </span>
  </button>
);

const AIIntelligence: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const preloadTab = (tab: Tab) => {
    void sectionLoaders[tab]();
  };

  const ActiveSection = sections[activeTab];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center text-xl font-bold text-gray-900">
            <Brain className="mr-2 h-6 w-6 text-indigo-600" /> AI Intelligence Suite
          </h2>
          <p className="text-sm text-gray-500">Monitor usage, enforce safety, and fine-tune decision engines.</p>
        </div>
      </div>

      <div className="flex w-fit space-x-1 overflow-x-auto rounded-lg bg-gray-100 p-1">
        <TabButton id="overview" label="Overview" icon={Activity} activeTab={activeTab} setActiveTab={setActiveTab} onPreload={preloadTab} />
        <TabButton id="fraud" label="Fraud Guard" icon={ShieldAlert} activeTab={activeTab} setActiveTab={setActiveTab} onPreload={preloadTab} />
        <TabButton id="governance" label="Governance AI" icon={Gavel} activeTab={activeTab} setActiveTab={setActiveTab} onPreload={preloadTab} />
        <TabButton id="churn" label="Churn Prediction" icon={UserX} activeTab={activeTab} setActiveTab={setActiveTab} onPreload={preloadTab} />
        <TabButton id="forecast" label="Growth Forecast" icon={TrendingUp} activeTab={activeTab} setActiveTab={setActiveTab} onPreload={preloadTab} />
        <TabButton id="optimize" label="Auto-Optimize" icon={Zap} activeTab={activeTab} setActiveTab={setActiveTab} onPreload={preloadTab} />
        <TabButton id="anomaly" label="Anomaly Detection" icon={AlertOctagon} activeTab={activeTab} setActiveTab={setActiveTab} onPreload={preloadTab} />
      </div>

      <div className="animate-fade-in">
        <Suspense fallback={<AISectionLoader />}>
          <ActiveSection />
        </Suspense>
      </div>
    </div>
  );
};

export default AIIntelligence;
