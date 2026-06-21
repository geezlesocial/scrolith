
import React, { useState, useEffect } from 'react';
import { PaymentGateway } from '../../types';
import { PaymentService } from '../../services/payment';
import { useNotification } from '../../context/NotificationContext';

const GatewaysTab = () => {
    const [gateways, setGateways] = useState<PaymentGateway[]>([]);
    const { showNotification } = useNotification();

    useEffect(() => {
        PaymentService.getGateways().then(setGateways);
    }, []);

    const toggleGateway = async (gw: PaymentGateway) => {
        const updated = { ...gw, isEnabled: !gw.isEnabled };
        await PaymentService.updateGateway(updated);
        setGateways(prev => prev.map(g => g.id === gw.id ? updated : g));
        showNotification('success', 'Gateway Updated', `${gw.name} is now ${updated.isEnabled ? 'Active' : 'Disabled'}`);
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {gateways.map(gw => (
                <div key={gw.id} className={`bg-white rounded-xl shadow-sm border p-6 ${gw.isEnabled ? 'border-green-200 ring-1 ring-green-100' : 'border-gray-200'}`}>
                    <div className="flex justify-between items-start mb-4">
                        <img src={gw.logo} alt={gw.name} className="h-8 object-contain" />
                        <button onClick={() => toggleGateway(gw)} className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${gw.isEnabled ? 'bg-green-600' : 'bg-gray-200'}`}>
                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${gw.isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                    </div>
                    <h3 className="font-bold text-gray-900 mb-1">{gw.name}</h3>
                    <div className="flex flex-wrap gap-2 mt-2">
                        {gw.supportedCurrencies.map(c => <span key={c} className="text-xs bg-gray-100 px-2 py-1 rounded">{c}</span>)}
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center text-sm">
                        <span className={`font-mono text-xs px-2 py-0.5 rounded ${gw.mode === 'live' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'}`}>{gw.mode.toUpperCase()}</span>
                        <button className="text-blue-600 hover:text-blue-800 font-medium">Configure</button>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default GatewaysTab;
