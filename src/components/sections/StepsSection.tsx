import React from 'react';
import { StepsContent } from '../../types';

const StepsSection = ({ content }: { content: StepsContent }) => {
  const { title = "How It Works", subtitle = "Follow these simple steps to get started", steps = [], layout = 'horizontal' } = content;
  
  if (steps.length === 0) {
    return (
      <div className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold text-gray-900">How It Works</h2>
          <p className="text-gray-600 mt-2">No steps available</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold text-gray-900">{title}</h2>
          {subtitle && (
            <p className="mt-4 max-w-2xl mx-auto text-xl text-gray-500">
              {subtitle}
            </p>
          )}
        </div>
        <div className={`${layout === 'horizontal' ? 'grid grid-cols-1 md:grid-cols-4 gap-8' : 'space-y-8'}`}>
          {steps
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((step, index) => (
              <div key={index} className="relative">
                <div className="flex flex-col items-center text-center">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 text-blue-600 mb-4">
                    <span className="text-xl font-bold">{step.order || index + 1}</span>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {step.title}
                  </h3>
                  <p className="text-gray-500">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default StepsSection;