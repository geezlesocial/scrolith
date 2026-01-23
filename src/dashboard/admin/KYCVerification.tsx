
import React, { useState, useEffect } from 'react';
import { KYCDocument } from '../../types';
import { CMSService } from '../../services/cms';
import { useNotification } from '../../context/NotificationContext';

const KYCTab = () => {
    const [docs, setDocs] = useState<KYCDocument[]>([]);
    const { showNotification } = useNotification();

    useEffect(() => {
        CMSService.getKYCRequests().then(setDocs);
    }, []);

    const handleAction = async (id: string, status: KYCDocument['status']) => {
        await CMSService.updateKYCStatus(id, status);
        setDocs(prev => prev.map(d => d.id === id ? { ...d, status } : d));
        showNotification('success', 'Status Updated', `KYC ${status}`);
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500"><tr><th>User</th><th>Type</th><th>Submitted</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody className="divide-y">
                    {docs.map(doc => (
                        <tr key={doc.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium">{doc.userName}</td>
                            <td className="px-6 py-4">{doc.type}</td>
                            <td className="px-6 py-4 text-gray-500">{new Date(doc.dateSubmitted).toLocaleDateString()}</td>
                            <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs font-bold uppercase ${doc.status === 'Approved' ? 'bg-green-100 text-green-700' : doc.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{doc.status}</span></td>
                            <td className="px-6 py-4 text-right space-x-2">
                                <button className="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded">View</button>
                                {doc.status === 'Pending' && (
                                    <>
                                        <button onClick={() => handleAction(doc.id, 'Approved')} className="text-green-600 hover:bg-green-50 px-2 py-1 rounded">Approve</button>
                                        <button onClick={() => handleAction(doc.id, 'Rejected')} className="text-red-600 hover:bg-red-50 px-2 py-1 rounded">Reject</button>
                                    </>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default KYCTab;
