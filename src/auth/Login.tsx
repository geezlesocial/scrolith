import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { UserRole } from '../types';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.FREELANCER);
  const { login, isAuthenticated, user, isLoading } = useUser();
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
        if (user.role === UserRole.ADMIN) {
            navigate('/admin');
        } else if (user.role === UserRole.EMPLOYER) {
            navigate('/client/dashboard');
        } else {
            navigate('/freelancer/dashboard');
        }
    }
  }, [isAuthenticated, user, isLoading, navigate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const success = login(email, password, role);
    
    if (success) {
        // Redirection happens via useEffect usually, but force here for immediate response
        // Note: The logic inside context handles the state update, which triggers useEffect
    } else {
        alert('Invalid email or password. Please try again.');
    }
  };

  if (isLoading) return null; // Or a spinner

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
            <Link to="/" className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-2xl text-white hover:bg-blue-700 transition">
                A
            </Link>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">Sign in to your account</h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email address</label>
              <div className="mt-1">
                <input id="email" type="email" required className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" 
                  value={email} onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
              <div className="mt-1">
                <input id="password" type="password" required className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" 
                   value={password} onChange={e => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div>
               <label className="block text-sm font-medium text-gray-700 mb-2">Login as...</label>
               <div className="grid grid-cols-3 gap-3">
                  {[UserRole.FREELANCER, UserRole.EMPLOYER, UserRole.ADMIN].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole(r)}
                        className={`px-2 py-2 text-xs font-medium rounded-md uppercase border transition-all ${
                            role === r ? 'bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {r}
                      </button>
                  ))}
               </div>
            </div>

            <div>
              <button type="submit" className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                Sign in
              </button>
            </div>
          </form>
          
          <div className="mt-6">
             <div className="relative">
                <div className="absolute inset-0 flex items-center">
                   <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                   <span className="px-2 bg-white text-gray-500">Or</span>
                </div>
             </div>
             <div className="mt-6 text-center">
                <Link to="/auth/signup" className="text-blue-600 hover:text-blue-500 font-medium">
                   Create an account
                </Link>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;