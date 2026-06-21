import React from 'react';
import { useParams } from 'react-router-dom';
import { MOCK_JOBS } from '../constants';
import { Tag, Clock } from 'lucide-react';

const JobDetail = () => {
  const { id } = useParams();
  const job = MOCK_JOBS.find(j => j.id === id) || MOCK_JOBS[0];

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
       <div className="bg-white border border-gray-200 rounded-lg p-8">
           <div className="flex justify-between items-start mb-6">
               <h1 className="text-2xl font-bold text-gray-900">{job.title}</h1>
               <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                  {job.status}
               </span>
           </div>
           
           <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-8 border-b border-gray-100 pb-6">
               <div className="flex items-center">
                   <span className="font-medium text-gray-900 mr-2">Budget:</span> {job.budget}
               </div>
               <div className="flex items-center">
                   <span className="font-medium text-gray-900 mr-2">Type:</span> {job.type}
               </div>
               <div className="flex items-center">
                   <Clock className="w-4 h-4 mr-1" /> Posted {job.postedTime}
               </div>
           </div>

           <div className="prose max-w-none mb-8">
               <h3 className="text-lg font-bold mb-2">Description</h3>
               <p className="text-gray-700">{job.description}</p>
           </div>

           <div className="mb-8">
               <h3 className="text-lg font-bold mb-2">Skills Required</h3>
               <div className="flex flex-wrap gap-2">
                   {job.tags.map(tag => (
                       <span key={tag} className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-700">
                           <Tag className="w-3 h-3 mr-1"/> {tag}
                       </span>
                   ))}
               </div>
           </div>

           <button className="px-6 py-3 bg-green-600 text-white font-bold rounded-md hover:bg-green-700">
               Apply Now
           </button>
       </div>
    </div>
  );
};

export default JobDetail;