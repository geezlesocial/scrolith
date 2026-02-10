import React from 'react';
import { useParams } from 'react-router-dom';
import CreateJob from '../../create-job-post/CreateJob';

export default function EditJob() {
  const { id } = useParams();

  if (!id) {
    return (
      <div className="p-6 bg-red-50 border border-red-100 rounded-xl text-red-700">
        Missing job ID.
      </div>
    );
  }

  return (
    <CreateJob
      jobId={id}
      mode="edit"
      redirectOnSuccess="/client/dashboard/jobs"
    />
  );
}
