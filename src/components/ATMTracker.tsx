
import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Pause, Clock, AlertCircle, Activity, DollarSign } from 'lucide-react';
import { Contract } from '../types';
import { ContractService } from '../services/contract';
import { useNotification } from '../context/NotificationContext';
import { useCurrency } from '../context/CurrencyContext';

interface ATMTrackerProps {
    contract: Contract;
    onUpdate?: () => void;
}

const ATMTracker: React.FC<ATMTrackerProps> = ({ contract, onUpdate }) => {
    const { showNotification } = useNotification();
    const { formatPrice } = useCurrency();
    const [isRunning, setIsRunning] = useState(false);
    const [elapsed, setElapsed] = useState(0); // seconds
    const [sessionStart, setSessionStart] = useState<Date | null>(null);
    const [note, setNote] = useState('');
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Initial Load & Persistence Check
    useEffect(() => {
        checkActiveSession();
        // Cleanup on unmount
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [contract.id]);

    const checkActiveSession = () => {
        const key = `atm_active_session_${contract.id}`;
        const stored = localStorage.getItem(key);
        if (stored) {
            const data = JSON.parse(stored);
            const start = new Date(data.startTime);
            setSessionStart(start);
            setNote(data.notes || '');
            setIsRunning(true);
            
            // Calculate elapsed immediately
            const now = new Date();
            setElapsed(Math.floor((now.getTime() - start.getTime()) / 1000));
            
            // Start local tick
            if (!timerRef.current) {
                timerRef.current = setInterval(() => {
                    setElapsed(prev => prev + 1);
                }, 1000);
            }
        } else {
            setIsRunning(false);
            setElapsed(0);
            setSessionStart(null);
            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    const formatTime = (totalSeconds: number) => {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    const handleStart = async () => {
        try {
            await ContractService.startTracking(contract.id);
            checkActiveSession();
            showNotification('success', 'Tracker Started', `Recording time for ${contract.title}`);
            if (onUpdate) onUpdate();
        } catch (error) {
            showNotification('alert', 'Error', 'Could not start tracker.');
        }
    };

    const handleStop = async () => {
        if (!isRunning) return;
        try {
            await ContractService.stopTracking(contract.id, note);
            stopTimerLocal();
            showNotification('success', 'Session Logged', 'Time entry saved successfully.');
            if (onUpdate) onUpdate();
        } catch (error) {
            showNotification('alert', 'Error', 'Failed to stop tracker.');
        }
    };

    const handlePause = async () => {
        if (!isRunning) return;
        try {
            // "Pause" stops the current session segment to save progress
            await ContractService.stopTracking(contract.id, note + ' (Session Paused)');
            stopTimerLocal();
            showNotification('info', 'Tracker Paused', 'Session segment saved. Click Start to resume.');
            if (onUpdate) onUpdate();
        } catch (error) {
            showNotification('alert', 'Error', 'Failed to pause tracker.');
        }
    };

    const stopTimerLocal = () => {
        setIsRunning(false);
        setElapsed(0);
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        setNote('');
        localStorage.removeItem(`atm_active_session_${contract.id}`);
    };

    // Calculate live earnings
    const currentEarnings = (elapsed / 3600) * contract.hourlyRate;

    return (
        <div className="bg-white rounded-xl shadow-lg border border-indigo-100 p-6 relative overflow-hidden">
             {isRunning && (
                <div className="absolute top-0 left-0 w-full h-1 bg-gray-100">
                    <div className="h-full bg-green-500 animate-[progress-indeterminate_2s_infinite_linear]"></div>
                </div>
            )}
            
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></div>
                        ATM Tracker (Live)
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">{contract.title}</p>
                </div>
                <div className="text-right">
                    <div className="text-3xl font-mono font-bold text-gray-800 tracking-wider">
                        {formatTime(elapsed)}
                    </div>
                    {isRunning && (
                        <p className="text-xs text-green-600 font-medium mt-1">
                            Earned: {formatPrice(currentEarnings)}
                        </p>
                    )}
                </div>
            </div>

            <div className="space-y-4">
                <input 
                    type="text" 
                    placeholder="What are you working on?" 
                    className="w-full border-gray-200 rounded-lg text-sm p-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    value={note}
                    onChange={e => {
                        setNote(e.target.value);
                        if (isRunning) {
                            // Persist note update live
                            const key = `atm_active_session_${contract.id}`;
                            const stored = localStorage.getItem(key);
                            if (stored) {
                                const data = JSON.parse(stored);
                                localStorage.setItem(key, JSON.stringify({ ...data, notes: e.target.value }));
                            }
                        }
                    }}
                />

                <div className="grid grid-cols-2 gap-3">
                    {!isRunning ? (
                        <button 
                            onClick={handleStart}
                            className="col-span-2 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl shadow-md transition-all transform hover:scale-[1.02] flex items-center justify-center"
                        >
                            <Play className="w-5 h-5 mr-2 fill-current" /> Start Tracking
                        </button>
                    ) : (
                        <>
                            <button 
                                onClick={handlePause}
                                className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center"
                            >
                                <Pause className="w-5 h-5 mr-2 fill-current" /> Pause
                            </button>
                            <button 
                                onClick={handleStop}
                                className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl shadow-md transition-colors flex items-center justify-center"
                            >
                                <Square className="w-5 h-5 mr-2 fill-current" /> Stop
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Stats Footer */}
            <div className="mt-6 pt-4 border-t border-gray-100 grid grid-cols-3 gap-2 text-center">
                <div>
                    <p className="text-[10px] text-gray-400 uppercase font-bold">Activity</p>
                    <p className="text-sm font-bold text-gray-700 flex items-center justify-center">
                        <Activity className="w-3 h-3 mr-1 text-blue-500" /> {isRunning ? '98%' : '-'}
                    </p>
                </div>
                <div>
                    <p className="text-[10px] text-gray-400 uppercase font-bold">Rate</p>
                    <p className="text-sm font-bold text-gray-700">{formatPrice(contract.hourlyRate)}/hr</p>
                </div>
                <div>
                    <p className="text-[10px] text-gray-400 uppercase font-bold">Today</p>
                    <p className="text-sm font-bold text-green-600">{formatPrice((contract.hoursToday || 0) * contract.hourlyRate)}</p>
                </div>
            </div>
            
            <style>{`
                @keyframes progress-indeterminate {
                    0% { width: 30%; margin-left: 0%; }
                    50% { width: 30%; margin-left: 70%; }
                    100% { width: 30%; margin-left: 0%; }
                }
            `}</style>
        </div>
    );
};

export default ATMTracker;
