import React from 'react';
import { MOCK_JOBS } from '../constants';
import { Clock, Tag } from 'lucide-react';
import { Link } from 'react-router-dom';

const BrowseJobs = () => {
  return (
    <div className="bg-gray-50 min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Browse Jobs</h1>

        <div className="space-y-4">
          {MOCK_JOBS.map((job) => (
            <Link key={job.id} to={`/jobs/${job.id}`} className="block bg-white shadow rounded-lg p-6 hover:shadow-md transition">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{job.title}</h2>
                  <div className="mt-1 flex items-center text-sm text-gray-500 space-x-4">
                     <span>{job.type}</span>
                     <span>•</span>
                     <span>{job.budget}</span>
                     <span>•</span>
                     <span>{job.clientName}</span>
                  </div>
                </div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  {job.status}
                </span>
              </div>
              <p className="mt-4 text-gray-600 line-clamp-2">{job.description}</p>
              <div className="mt-4 flex items-center justify-between">
                 <div className="flex items-center space-x-2">
                    {job.tags.map((tag) => (
                        <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                            <Tag className="w-3 h-3 mr-1" />{tag}
                        </span>
                    ))}
                 </div>
                 <div className="flex items-center text-sm text-gray-500">
                    <Clock className="w-4 h-4 mr-1"/>
                    Posted {job.postedTime}
                 </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BrowseJobs;