
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { UserRole } from '../types';
import { Briefcase, User, Shield } from 'lucide-react';

const Signup = () => {
  const { signup } = useUser();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
      firstName: '',
      lastName: '',
      email: '',
      password: ''
  });
  const [role, setRole] = useState<UserRole>(UserRole.FREELANCER);

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      // Combine names
      const fullName = `${formData.firstName} ${formData.lastName}`.trim();
      
      // Call signup from context
      signup(formData.email, fullName, role);

      // Redirect based on role
      if (role === UserRole.ADMIN) navigate('/admin');
      else if (role === UserRole.EMPLOYER) navigate('/client/dashboard');
      else navigate('/freelancer/dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
            <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-2xl text-white">
                A
            </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">Create your account</h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link to="/auth/login" className="font-medium text-blue-600 hover:text-blue-500">
            Sign in
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit}>
            
            {/* Role Selection */}
            <div>
               <label className="block text-sm font-medium text-gray-700 mb-3">I want to...</label>
               <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRole(UserRole.FREELANCER)}
                    className={`flex items-center justify-center px-3 py-3 border rounded-lg text-sm font-medium transition-all ${
                        role === UserRole.FREELANCER 
                        ? 'bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500' 
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <User className="w-4 h-4 mr-2" /> Work as Freelancer
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole(UserRole.EMPLOYER)}
                    className={`flex items-center justify-center px-3 py-3 border rounded-lg text-sm font-medium transition-all ${
                        role === UserRole.EMPLOYER 
                        ? 'bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500' 
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Briefcase className="w-4 h-4 mr-2" /> Hire Talent
                  </button>
               </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="block text-sm font-medium text-gray-700">First Name</label>
                  <input 
                    type="text" 
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm" 
                    value={formData.firstName}
                    onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                  />
               </div>
               <div>
                  <label className="block text-sm font-medium text-gray-700">Last Name</label>
                  <input 
                    type="text" 
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm" 
                    value={formData.lastName}
                    onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                  />
               </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Email address</label>
              <input 
                type="email" 
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm" 
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <input 
                type="password" 
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm" 
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
              />
            </div>

            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="terms"
                  name="terms"
                  type="checkbox"
                  required
                  className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="terms" className="font-medium text-gray-700">
                  I agree to the <Link to="/p/terms" className="text-blue-600 hover:text-blue-500">Terms</Link> and <Link to="/p/privacy" className="text-blue-600 hover:text-blue-500">Privacy Policy</Link>
                </label>
              </div>
            </div>

            <div>
              <button type="submit" className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                Sign up
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Signup;
