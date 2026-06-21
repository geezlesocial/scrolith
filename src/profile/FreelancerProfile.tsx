
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapPin, Star, PlayCircle, Clock, Briefcase, GraduationCap, Award, CheckCircle, ShieldCheck, TrendingUp } from 'lucide-react';
import { useUser } from '../context/UserContext';
import { UserRole, TrustScore } from '../types';
import { ReputationService } from '../services/ai/reputation.service';

const FreelancerProfile = () => {
  const { id } = useParams();
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState('overview');
  const [trustScore, setTrustScore] = useState<TrustScore | null>(null);

  // Mock data for display since backend is simulated
  const profileData = {
    name: "John Doe",
    title: "Senior Full Stack Developer",
    location: "San Francisco, CA",
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
    coverImage: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=1000&q=80",
    bio: "I am a passionate Full Stack Developer with over 5 years of experience building web applications. I specialize in React, Node.js, and Cloud Infrastructure.",
    rating: 4.9,
    hourlyRate: 85,
    jobsCompleted: 124,
    availability: "Available",
    skills: ['React', 'Node.js', 'TypeScript', 'AWS', 'Docker', 'PostgreSQL'],
    introVideo: "https://www.w3schools.com/html/mov_bbb.mp4",
    experience: [
        { id: '1', title: "Senior Developer", company: "TechCorp", country: "USA", startDate: "2020", endDate: "Present", description: "Leading a team of 5 developers building SaaS products." },
        { id: '2', title: "Web Developer", company: "StartUp Inc", country: "USA", startDate: "2018", endDate: "2020", description: "Developed main company website and client portal." }
    ],
    education: [
        { id: '1', school: "Stanford University", degree: "B.S.", fieldOfStudy: "Computer Science", startYear: "2014", endYear: "2018", country: "USA" }
    ],
    certifications: [
        { id: '1', name: "AWS Certified Solutions Architect", issuer: "Amazon Web Services", issueDate: "2022", isVerified: true }
    ]
  };

  useEffect(() => {
      // Load Trust Score
      ReputationService.getTrustScore(id || 'unknown').then(setTrustScore);
  }, [id]);

  const isOwner = user?.role === UserRole.FREELANCER; 

  return (
    <div className="bg-gray-50 min-h-screen pb-12">
        {/* Header Cover */}
        <div className="h-60 w-full bg-cover bg-center relative" style={{ backgroundImage: `url(${profileData.coverImage})` }}>
            <div className="absolute inset-0 bg-black/20"></div>
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-20 relative z-10">
            <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
                <div className="p-6 md:p-8">
                    <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
                        <div className="flex items-end gap-6">
                            <img className="w-32 h-32 rounded-xl border-4 border-white shadow-md bg-white" src={profileData.avatar} alt="" />
                            <div className="mb-2">
                                <h1 className="text-3xl font-bold text-gray-900">{profileData.name}</h1>
                                <p className="text-lg text-gray-600 font-medium">{profileData.title}</p>
                                <div className="flex items-center text-gray-500 mt-1 text-sm">
                                    <MapPin className="w-4 h-4 mr-1" /> {profileData.location}
                                    <span className="mx-2">•</span>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${profileData.availability === 'Available' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                        {profileData.availability}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            {isOwner ? (
                                <Link to="/profile/edit" className="px-6 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition shadow-sm">
                                    Edit Profile
                                </Link>
                            ) : (
                                <button className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition shadow-lg shadow-blue-600/20">
                                    Contact Me
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="flex border-b border-gray-200 mt-10 space-x-8">
                        {['Overview', 'Portfolio', 'Reviews'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab.toLowerCase())}
                                className={`pb-4 text-sm font-medium border-b-2 transition-colors ${
                                    activeTab === tab.toLowerCase() 
                                    ? 'border-blue-600 text-blue-600' 
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="bg-gray-50 p-6 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* Intro Video */}
                        {profileData.introVideo && (
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                                    <PlayCircle className="w-5 h-5 mr-2 text-blue-600" /> Intro Video
                                </h3>
                                <div className="aspect-video bg-black rounded-lg overflow-hidden">
                                    <video controls className="w-full h-full">
                                        <source src={profileData.introVideo} type="video/mp4" />
                                        Your browser does not support the video tag.
                                    </video>
                                </div>
                            </div>
                        )}

                        {/* About */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-900 mb-4">About Me</h3>
                            <p className="text-gray-600 leading-relaxed">{profileData.bio}</p>
                        </div>

                        {/* Experience */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center">
                                <Briefcase className="w-5 h-5 mr-2 text-blue-600" /> Work Experience
                            </h3>
                            <div className="space-y-6">
                                {profileData.experience.map((exp) => (
                                    <div key={exp.id} className="relative pl-8 border-l-2 border-gray-100 last:border-0">
                                        <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-blue-100 border-2 border-blue-600"></div>
                                        <h4 className="text-base font-bold text-gray-900">{exp.title}</h4>
                                        <div className="text-sm text-gray-500 mb-2">{exp.company} • {exp.startDate} - {exp.endDate}</div>
                                        <p className="text-sm text-gray-600">{exp.description}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Education */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center">
                                <GraduationCap className="w-5 h-5 mr-2 text-blue-600" /> Education
                            </h3>
                            <div className="space-y-4">
                                {profileData.education.map((edu) => (
                                    <div key={edu.id} className="flex justify-between items-start">
                                        <div>
                                            <h4 className="text-base font-bold text-gray-900">{edu.school}</h4>
                                            <p className="text-sm text-gray-600">{edu.degree}, {edu.fieldOfStudy}</p>
                                        </div>
                                        <div className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                                            {edu.startYear} - {edu.endYear}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-6">
                        {/* Trust Score AI */}
                        {trustScore && (
                            <div className="bg-gradient-to-br from-indigo-900 to-blue-900 p-6 rounded-xl shadow-lg text-white">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-bold flex items-center">
                                        <ShieldCheck className="w-5 h-5 mr-2 text-green-400" /> Trust Score
                                    </h3>
                                    <span className="text-xs bg-white/20 px-2 py-1 rounded">AI Verified</span>
                                </div>
                                <div className="flex items-end mb-4">
                                    <span className="text-4xl font-extrabold text-white">{trustScore.overallScore}</span>
                                    <span className="text-indigo-200 mb-1 ml-1">/100</span>
                                </div>
                                <div className="space-y-2 text-sm text-indigo-100">
                                    <div className="flex justify-between">
                                        <span>Reliability</span>
                                        <span className="font-bold">{trustScore.reliability}%</span>
                                    </div>
                                    <div className="w-full bg-black/20 rounded-full h-1.5">
                                        <div className="bg-green-400 h-1.5 rounded-full" style={{ width: `${trustScore.reliability}%` }}></div>
                                    </div>
                                    <div className="flex justify-between pt-1">
                                        <span>Professionalism</span>
                                        <span className="font-bold">{trustScore.professionalism}%</span>
                                    </div>
                                    <div className="w-full bg-black/20 rounded-full h-1.5">
                                        <div className="bg-blue-400 h-1.5 rounded-full" style={{ width: `${trustScore.professionalism}%` }}></div>
                                    </div>
                                </div>
                                {trustScore.trend === 'up' && (
                                    <div className="mt-4 pt-3 border-t border-white/10 flex items-center text-xs text-green-300">
                                        <TrendingUp className="w-3 h-3 mr-1" /> Trending Up this month
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Stats Card */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-100">
                                <span className="text-gray-600">Hourly Rate</span>
                                <span className="font-bold text-xl">${profileData.hourlyRate}</span>
                            </div>
                            <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-100">
                                <span className="text-gray-600">Rating</span>
                                <span className="font-bold flex items-center text-gray-900">
                                    <Star className="w-4 h-4 text-yellow-400 fill-current mr-1"/> {profileData.rating}
                                </span>
                            </div>
                            <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-100">
                                <span className="text-gray-600">Jobs Done</span>
                                <span className="font-bold text-gray-900">{profileData.jobsCompleted}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600">Response Time</span>
                                <span className="font-bold text-gray-900">~ 1 Hour</span>
                            </div>
                        </div>

                        {/* Skills */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h3 className="font-bold text-gray-900 mb-4">Skills</h3>
                            <div className="flex flex-wrap gap-2">
                                {profileData.skills.map(skill => (
                                    <span key={skill} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium">
                                        {skill}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Certifications */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h3 className="font-bold text-gray-900 mb-4 flex items-center">
                                <Award className="w-5 h-5 mr-2 text-blue-600" /> Certifications
                            </h3>
                            <div className="space-y-4">
                                {profileData.certifications.map((cert) => (
                                    <div key={cert.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <div className="font-bold text-sm text-gray-900">{cert.name}</div>
                                                <div className="text-xs text-gray-500">{cert.issuer} • {cert.issueDate}</div>
                                            </div>
                                            {cert.isVerified && <CheckCircle className="w-4 h-4 text-green-500" />}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

export default FreelancerProfile;
