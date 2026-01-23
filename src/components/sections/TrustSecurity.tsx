
import React from 'react';
import { ShieldCheck, Lock, UserCheck, CreditCard } from 'lucide-react';
import { TrustSecurityContent } from '../../types';

const TrustSecurity = ({ content }: { content?: TrustSecurityContent }) => {
    const features = content?.features || [
        { 
            icon: 'shield', 
            title: 'Protected Payments', 
            description: 'Funds are held securely in escrow until you approve the work.' 
        },
        { 
            icon: 'user', 
            title: 'Verified Talent', 
            description: 'We verify freelancer identities and skills to ensure quality.' 
        },
        { 
            icon: 'lock', 
            title: 'Secure Data', 
            description: 'Your data is encrypted and protected by enterprise-grade security.' 
        },
        { 
            icon: 'card', 
            title: 'Safe Transactions', 
            description: 'We use trusted payment gateways and fraud detection systems.' 
        }
    ];

    const getIcon = (iconName: string) => {
        switch(iconName) {
            case 'shield': return <ShieldCheck className="w-8 h-8 text-green-600" />;
            case 'user': return <UserCheck className="w-8 h-8 text-blue-600" />;
            case 'lock': return <Lock className="w-8 h-8 text-purple-600" />;
            case 'card': return <CreditCard className="w-8 h-8 text-orange-600" />;
            default: return <ShieldCheck className="w-8 h-8 text-gray-600" />;
        }
    };

    return (
        <div className="py-20 bg-gray-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-16">
                    <h2 className="text-3xl font-extrabold text-gray-900 mb-4">
                        {content?.title || "Your Safety is Our Priority"}
                    </h2>
                    <div className="w-20 h-1 bg-indigo-600 mx-auto rounded-full"></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    {features.map((feature, idx) => (
                        <div key={idx} className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition text-center group">
                            <div className="w-16 h-16 mx-auto bg-gray-50 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                {getIcon(feature.icon)}
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-3">{feature.title}</h3>
                            <p className="text-gray-600 text-sm leading-relaxed">{feature.description}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default TrustSecurity;
