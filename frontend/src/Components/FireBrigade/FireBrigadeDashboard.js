import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../Context/AuthContext';
import { emergencyRequestAPI } from '../../utils/apiService';

const FireBrigadeDashboard = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [waterLevel, setWaterLevel] = useState(100);
    const [emergencyRequest, setEmergencyRequest] = useState({
        location: '',
        description: '',
        urgency: 'high',
        waterLevel: '100%'
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showMap, setShowMap] = useState(false);
    const [autoRequestSent, setAutoRequestSent] = useState(false);
    const [recentRequests, setRecentRequests] = useState([]);
    const [pendingRequests, setPendingRequests] = useState([]);

    const handleLogout = () => {
        logout('/login');
        navigate('/login');
    };

    // Load water level from localStorage on component mount
    useEffect(() => {
        const savedWaterLevel = localStorage.getItem(`waterLevel_${user?.id || 'default'}`);
        if (savedWaterLevel) {
            setWaterLevel(parseInt(savedWaterLevel));
        }
        
        // Check for completed emergency requests
        checkForCompletedDeliveries();
        
        // Set up interval to check for completed deliveries every 10 seconds (more frequent)
        const interval = setInterval(checkForCompletedDeliveries, 10000);
        
        return () => clearInterval(interval);
    }, [user]);

    // Save water level to localStorage whenever it changes
    useEffect(() => {
        localStorage.setItem(`waterLevel_${user?.id || 'default'}`, waterLevel.toString());
    }, [waterLevel, user]);


    // Check for completed emergency requests and reset water level
    const checkForCompletedDeliveries = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            // Get emergency requests for this brigade
            const brigadeId = user?.id || user?.brigadeId || 'fire-brigade-001';
            console.log('🔍 Fetching requests for brigade ID:', brigadeId);
            const response = await fetch(`http://localhost:5000/emergency-requests/brigade/${brigadeId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                const requests = data.data || [];
                console.log('📡 All emergency requests for brigade:', requests);
                
                // Check if any request was completed recently (only check actual delivery time, not updatedAt)
                const completedRequests = requests.filter(req => {
                    // Only consider requests that are actually completed
                    if (req.status !== 'Completed') return false;
                    
                    // Only consider requests that have an actual delivery time
                    if (!req.actualDeliveryTime) return false;
                    
                    // Check if the delivery was completed in the last 10 minutes (extended window)
                    const deliveryTime = new Date(req.actualDeliveryTime);
                    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
                    
                    console.log(`Checking request ${req._id}: status=${req.status}, actualDeliveryTime=${req.actualDeliveryTime}, deliveryTime=${deliveryTime}, tenMinutesAgo=${tenMinutesAgo}, isRecent=${deliveryTime > tenMinutesAgo}`);
                    
                    return deliveryTime > tenMinutesAgo;
                });
                
                console.log(`Found ${completedRequests.length} recently completed requests`);
                
                if (completedRequests.length > 0) {
                    console.log('🚰 Resetting water level to 100% due to completed delivery');
                    
                    // Reset water level to 100% and show notification
                    setWaterLevel(100);
                    setAutoRequestSent(false);
                    
                    // Immediately update localStorage to prevent race conditions
                    localStorage.setItem(`waterLevel_${user?.id || 'default'}`, '100');
                    
                    alert('🎉 Water delivery completed! Tank refilled to 100%.');
                    
                    // Update recent requests
                    setRecentRequests(prev => [{
                        id: completedRequests[0]._id,
                        type: 'Delivery Completed',
                        level: 100,
                        status: 'Completed',
                        timestamp: new Date().toLocaleTimeString()
                    }, ...prev.slice(0, 4)]);
                }
                
                // Update pending requests
                setPendingRequests(requests.filter(req => 
                    req.status === 'Approved - Sent to Branch Manager' || 
                    req.status === 'In Progress'
                ));
            }
        } catch (error) {
            console.error('Error checking completed deliveries:', error);
        }
    };

    // Auto-request emergency water when level drops below 35%
    const sendAutomaticEmergencyRequest = async (currentLevel) => {
        try {
            // Generate realistic emergency location from predefined list
            const emergencyLocation = generateRealisticEmergencyLocation();
            
            // Calculate distance from branch for verification
            const branchLocation = { lat: 6.9106, lng: 79.8648 };
            const straightDistance = calculateDistance(
                branchLocation.lat, 
                branchLocation.lng,
                emergencyLocation.lat, 
                emergencyLocation.lng
            );
            const roadDistance = calculateRoadDistance(
                branchLocation.lat, 
                branchLocation.lng,
                emergencyLocation.lat, 
                emergencyLocation.lng
            );
            
            console.log(`🚨 Auto-emergency location generated:`);
            console.log(`📍 Location: ${emergencyLocation.address}, ${emergencyLocation.area}`);
            console.log(`📍 Coordinates: ${emergencyLocation.lat}, ${emergencyLocation.lng}`);
            console.log(`📏 Straight-line distance: ${straightDistance.toFixed(2)} km`);
            console.log(`🛣️ Road distance: ${roadDistance.toFixed(2)} km`);
            
            // Use generated coordinates
            let coordinates = {
                lat: emergencyLocation.lat,
                lng: emergencyLocation.lng
            };

            const requestData = {
                brigadeId: user?.id || 'fire-brigade-001',
                brigadeName: user?.brigadeName || 'Fire Brigade',
                brigadeLocation: `${emergencyLocation.address}, ${emergencyLocation.area}`,
                requestType: 'Emergency Water Supply',
                priority: 'Critical',
                waterLevel: `${currentLevel}%`,
                description: `AUTOMATIC REQUEST: Water level critically low at ${currentLevel}%. Immediate water supply required for emergency operations.`,
                coordinates: coordinates
            };

            const response = await emergencyRequestAPI.createRequest(requestData);
            
            if (response.success) {
                setAutoRequestSent(true);
                alert(`🚨 AUTOMATIC EMERGENCY REQUEST SENT! 🚨\n\nWater level dropped to ${currentLevel}%.\nEmergency water request has been automatically submitted to admin.\nRequest ID: ${response.data._id.slice(-8)}`);
                
                // Add to recent requests
                setRecentRequests(prev => [{
                    id: response.data._id,
                    type: 'Automatic',
                    level: currentLevel,
                    status: 'Pending',
                    timestamp: new Date().toLocaleTimeString()
                }, ...prev.slice(0, 4)]); // Keep only last 5 requests
            }
        } catch (error) {
            console.error('Error sending automatic emergency request:', error);
            alert('Failed to send automatic emergency request. Please submit manually.');
        }
    };

    const handleWaterLevelChange = (newLevel) => {
        setWaterLevel(newLevel);
        
        // Check if water level dropped below 35% and auto-request hasn't been sent
        if (newLevel <= 35 && !autoRequestSent) {
            sendAutomaticEmergencyRequest(newLevel);
        }
        
        // Reset auto-request flag when water level goes above 50%
        if (newLevel > 50) {
            setAutoRequestSent(false);
        }
        
        // Show warning for low levels
        if (newLevel <= 30) {
            alert('Water level is critically low! Emergency request has been automatically sent to admin.');
        }
    };

    // Realistic emergency locations in Colombo area (within 30km radius) - Updated with exact coordinates
    const realisticEmergencyLocations = [
        // Colombo 01-15 areas with exact coordinates provided
        { lat: 6.9355, lng: 79.8430, address: "Fort, Galle Road", area: "Colombo 01" },
        { lat: 6.9219, lng: 79.8507, address: "Slave Island, Kompannavidiya", area: "Colombo 02" },
        { lat: 6.9063, lng: 79.8530, address: "Kollupitiya, Galle Road", area: "Colombo 03" },
        { lat: 6.9004, lng: 79.8560, address: "Bambalapitiya, Galle Road", area: "Colombo 04" },
        { lat: 6.8797, lng: 79.8652, address: "Havelock Town, Galle Road", area: "Colombo 05" },
        { lat: 6.8741, lng: 79.8612, address: "Wellawatte, Galle Road", area: "Colombo 06" },
        { lat: 6.9106, lng: 79.8648, address: "Cinnamon Gardens, Reid Avenue", area: "Colombo 07" },
        { lat: 6.9183, lng: 79.8760, address: "Borella, Baseline Road", area: "Colombo 08" },
        { lat: 6.9391, lng: 79.8787, address: "Dematagoda, Baseline Road", area: "Colombo 09" },
        { lat: 6.9337, lng: 79.8641, address: "Maradana, Baseline Road", area: "Colombo 10" },
        { lat: 6.9385, lng: 79.8577, address: "Pettah Market Area", area: "Colombo 11" },
        { lat: 6.9378, lng: 79.8614, address: "Hulftsdorp, Baseline Road", area: "Colombo 12" },
        { lat: 6.9486, lng: 79.8608, address: "Kotahena, Negombo Road", area: "Colombo 13" },
        { lat: 6.9522, lng: 79.8737, address: "Grandpass, Negombo Road", area: "Colombo 14" },
        { lat: 6.9633, lng: 79.8669, address: "Mutwal, Negombo Road", area: "Colombo 15" },
        
        // Additional specific addresses with exact coordinates
        { lat: 6.9633, lng: 79.8669, address: "Mattakkuliya, Negombo Road", area: "Colombo 15" },
        { lat: 6.9337, lng: 79.8641, address: "Panchikawatte, Baseline Road", area: "Colombo 10" },
        { lat: 6.7730, lng: 79.8816, address: "Moratuwa, Galle Road", area: "Colombo 06" },
        
        // Colombo South areas
        { lat: 6.8700, lng: 79.8700, address: "Ratmalana, Galle Road", area: "Colombo 06" },
        { lat: 6.8600, lng: 79.8600, address: "Moratuwa, Galle Road", area: "Colombo 06" },
        { lat: 6.8500, lng: 79.8500, address: "Panadura, Galle Road", area: "Colombo 06" },
        
        // Colombo West areas
        { lat: 6.9200, lng: 79.8400, address: "Borella, Baseline Road", area: "Colombo 08" },
        { lat: 6.9300, lng: 79.8300, address: "Maradana, Baseline Road", area: "Colombo 10" },
        { lat: 6.9400, lng: 79.8200, address: "Dematagoda, Baseline Road", area: "Colombo 09" },
        
        // Extended areas within 30km
        { lat: 6.8000, lng: 79.9000, address: "Kalutara, Galle Road", area: "Kalutara" },
        { lat: 6.9900, lng: 79.9500, address: "Katunayake, Airport Road", area: "Katunayake" },
        { lat: 6.8500, lng: 79.9200, address: "Kesbewa, High Level Road", area: "Kesbewa" },
        { lat: 6.9500, lng: 79.8000, address: "Kelaniya, Kelaniya Road", area: "Kelaniya" },
        { lat: 6.9000, lng: 79.8000, address: "Ragama, Negombo Road", area: "Ragama" },
        { lat: 6.8200, lng: 79.8800, address: "Horana, Horana Road", area: "Horana" },
        { lat: 6.7800, lng: 79.9200, address: "Bandaragama, Galle Road", area: "Bandaragama" },
        { lat: 6.7600, lng: 79.9400, address: "Wadduwa, Galle Road", area: "Wadduwa" },
        { lat: 6.7400, lng: 79.9600, address: "Kalutara North, Galle Road", area: "Kalutara" },
        { lat: 6.7200, lng: 79.9800, address: "Beruwala, Galle Road", area: "Beruwala" }
    ];

    // Function to calculate road distance (approximate based on road network)
    const calculateRoadDistance = (lat1, lng1, lat2, lng2) => {
        // Straight-line distance
        const straightDistance = calculateDistance(lat1, lng1, lat2, lng2);
        
        // Road distance is typically 1.2-1.5x longer than straight-line distance in Colombo
        // This accounts for road curves, intersections, and traffic patterns
        const roadMultiplier = 1.3; // 30% longer than straight line
        
        return straightDistance * roadMultiplier;
    };

    // Function to generate realistic emergency location from predefined list
    const generateRealisticEmergencyLocation = () => {
        // Filter locations within 30km road distance from Colombo 07 Branch (Cinnamon Gardens)
        const branchLocation = { lat: 6.9106, lng: 79.8648 };
        const validLocations = realisticEmergencyLocations.filter(location => {
            const roadDistance = calculateRoadDistance(
                branchLocation.lat, 
                branchLocation.lng,
                location.lat, 
                location.lng
            );
            return roadDistance <= 30; // Within 30km road distance
        });
        
        // Randomly select one of the valid locations
        const randomIndex = Math.floor(Math.random() * validLocations.length);
        const selectedLocation = validLocations[randomIndex];
        
        return {
            lat: selectedLocation.lat,
            lng: selectedLocation.lng,
            address: selectedLocation.address,
            area: selectedLocation.area
        };
    };

    // Function to calculate distance between two points
    const calculateDistance = (lat1, lng1, lat2, lng2) => {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    };

    const handleEmergencyRequest = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        
        try {
            // Generate realistic emergency location from predefined list
            const emergencyLocation = generateRealisticEmergencyLocation();
            
            // Calculate distance from branch for verification
            const branchLocation = { lat: 6.9106, lng: 79.8648 };
            const straightDistance = calculateDistance(
                branchLocation.lat, 
                branchLocation.lng,
                emergencyLocation.lat, 
                emergencyLocation.lng
            );
            const roadDistance = calculateRoadDistance(
                branchLocation.lat, 
                branchLocation.lng,
                emergencyLocation.lat, 
                emergencyLocation.lng
            );
            
            console.log(`🚨 Emergency location generated:`);
            console.log(`📍 Location: ${emergencyLocation.address}, ${emergencyLocation.area}`);
            console.log(`📍 Coordinates: ${emergencyLocation.lat}, ${emergencyLocation.lng}`);
            console.log(`📏 Straight-line distance: ${straightDistance.toFixed(2)} km`);
            console.log(`🛣️ Road distance: ${roadDistance.toFixed(2)} km`);
            
            // Use generated coordinates instead of GPS
            let coordinates = {
                lat: emergencyLocation.lat,
                lng: emergencyLocation.lng
            };

            // Map urgency to priority
            const priorityMap = {
                'high': 'High',
                'medium': 'Medium',
                'low': 'Low'
            };

            const requestData = {
                brigadeId: user?.id || 'fire-brigade-001',
                brigadeName: user?.brigadeName || 'Fire Brigade',
                brigadeLocation: `${emergencyLocation.address}, ${emergencyLocation.area}`,
                requestType: 'Emergency Water Supply',
                priority: priorityMap[emergencyRequest.urgency] || 'High',
                waterLevel: emergencyRequest.waterLevel,
                description: emergencyRequest.description,
                coordinates: coordinates
            };

            const response = await emergencyRequestAPI.createRequest(requestData);
            
            if (response.success) {
                alert('Emergency water request submitted successfully! Admin will review and respond.');
                
                // Add to recent requests
                setRecentRequests(prev => [{
                    id: response.data._id,
                    type: 'Manual',
                    level: parseInt(emergencyRequest.waterLevel),
                    status: 'Pending',
                    timestamp: new Date().toLocaleTimeString()
                }, ...prev.slice(0, 4)]); // Keep only last 5 requests
                
                setEmergencyRequest({
                    location: '',
                    description: '',
                    urgency: 'high',
                    waterLevel: '100%'
                });
            } else {
                alert('Failed to submit emergency request. Please try again.');
            }
        } catch (error) {
            console.error('Error submitting emergency request:', error);
            alert('Error submitting emergency request. Please check your connection and try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white shadow-sm border-b">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-4">
                        <div className="flex items-center">
                            <div className="flex-shrink-0">
                                <h1 className="text-2xl font-bold text-red-600">AquaLink Emergency</h1>
                            </div>
                        </div>
                        <div className="flex items-center space-x-4">
                            <span className="text-gray-700">Welcome, {user?.name}</span>
                            <span className="text-sm text-gray-500">{user?.brigadeName}</span>
                            <button
                                onClick={handleLogout}
                                className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
                            >
                                Logout
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Navigation */}
            <nav className="bg-white shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex space-x-8">
                        <button
                            onClick={() => setActiveTab('dashboard')}
                            className={`py-4 px-1 border-b-2 font-medium text-sm ${
                                activeTab === 'dashboard'
                                    ? 'border-red-500 text-red-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            Dashboard
                        </button>
                        <button
                            onClick={() => setActiveTab('emergency')}
                            className={`py-4 px-1 border-b-2 font-medium text-sm ${
                                activeTab === 'emergency'
                                    ? 'border-red-500 text-red-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            Emergency Request
                        </button>
                        <button
                            onClick={() => setActiveTab('map')}
                            className={`py-4 px-1 border-b-2 font-medium text-sm ${
                                activeTab === 'map'
                                    ? 'border-red-500 text-red-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            Branch Map
                        </button>
                        <button
                            onClick={() => setActiveTab('profile')}
                            className={`py-4 px-1 border-b-2 font-medium text-sm ${
                                activeTab === 'profile'
                                    ? 'border-red-500 text-red-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            Profile
                        </button>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                {activeTab === 'dashboard' && (
                    <div className="px-4 py-6 sm:px-0">
                        <div className="border-4 border-dashed border-gray-200 rounded-lg p-6">
                            <h2 className="text-2xl font-bold text-gray-900 mb-6">Emergency Water Supply Dashboard</h2>
                            
                            {/* Water Level Monitor */}
                            <div className="bg-white shadow rounded-lg p-6 mb-6">
                                <h3 className="text-lg font-medium text-gray-900 mb-4">Water Level Monitor</h3>
                                <div className="flex items-center space-x-4">
                                    <div className="flex-1">
                                        <div className="bg-gray-200 rounded-full h-8">
                                            <div 
                                                className={`h-8 rounded-full transition-all duration-300 ${
                                                    waterLevel > 50 ? 'bg-green-500' : 
                                                    waterLevel > 30 ? 'bg-yellow-500' : 'bg-red-500'
                                                }`}
                                                style={{ width: `${waterLevel}%` }}
                                            ></div>
                                        </div>
                                        <p className="text-sm text-gray-600 mt-2">Current Level: {waterLevel}%</p>
                                    </div>
                                    <div className="flex space-x-2">
                                        <button
                                            onClick={() => handleWaterLevelChange(Math.max(0, waterLevel - 10))}
                                            className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
                                        >
                                            Decrease
                                        </button>
                                        <button
                                            onClick={() => handleWaterLevelChange(Math.min(100, waterLevel + 10))}
                                            className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                                        >
                                            Increase
                                        </button>
                                    </div>
                                </div>
                                {waterLevel <= 35 && (
                                    <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
                                        <div className="flex">
                                            <div className="flex-shrink-0">
                                                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div className="ml-3">
                                                <h3 className="text-sm font-medium text-red-800">
                                                    {waterLevel <= 35 ? 'Critical Water Level Alert' : 'Low Water Level Warning'}
                                                </h3>
                                                <p className="text-sm text-red-700 mt-1">
                                                    {waterLevel <= 35 
                                                        ? (autoRequestSent 
                                                            ? 'Emergency request automatically sent to admin!' 
                                                            : 'Water level critically low. Emergency request will be sent automatically.')
                                                        : 'Water level is low. Consider requesting emergency supply.'
                                                    }
                                                </p>
                                                {autoRequestSent && (
                                                    <p className="text-xs text-red-600 mt-1">
                                                        ✅ Automatic emergency request sent to admin dashboard
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Quick Stats */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                                <div className="bg-white overflow-hidden shadow rounded-lg">
                                    <div className="p-5">
                                        <div className="flex items-center">
                                            <div className="flex-shrink-0">
                                                <div className="w-8 h-8 bg-red-500 rounded-md flex items-center justify-center">
                                                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                    </svg>
                                                </div>
                                            </div>
                                            <div className="ml-5 w-0 flex-1">
                                                <dl>
                                                    <dt className="text-sm font-medium text-gray-500 truncate">Emergency Requests</dt>
                                                    <dd className="text-lg font-medium text-gray-900">3</dd>
                                                </dl>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white overflow-hidden shadow rounded-lg">
                                    <div className="p-5">
                                        <div className="flex items-center">
                                            <div className="flex-shrink-0">
                                                <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center">
                                                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                </div>
                                            </div>
                                            <div className="ml-5 w-0 flex-1">
                                                <dl>
                                                    <dt className="text-sm font-medium text-gray-500 truncate">Approved Requests</dt>
                                                    <dd className="text-lg font-medium text-gray-900">2</dd>
                                                </dl>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white overflow-hidden shadow rounded-lg">
                                    <div className="p-5">
                                        <div className="flex items-center">
                                            <div className="flex-shrink-0">
                                                <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                                                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    </svg>
                                                </div>
                                            </div>
                                            <div className="ml-5 w-0 flex-1">
                                                <dl>
                                                    <dt className="text-sm font-medium text-gray-500 truncate">Nearby Branches</dt>
                                                    <dd className="text-lg font-medium text-gray-900">5</dd>
                                                </dl>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Pending Requests */}
                            {pendingRequests.length > 0 && (
                                <div className="bg-white shadow rounded-lg p-6 mb-6">
                                    <h3 className="text-lg font-medium text-gray-900 mb-4">🚚 Pending Water Deliveries</h3>
                                    <div className="space-y-3">
                                        {pendingRequests.map((request) => (
                                            <div key={request._id} className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <p className="font-medium text-blue-900">Water Delivery In Progress</p>
                                                        <p className="text-sm text-blue-700">Status: {request.status}</p>
                                                        <p className="text-xs text-blue-600">
                                                            Requested: {new Date(request.requestDate).toLocaleString()}
                                                        </p>
                                                        {request.assignedDriver && (
                                                            <p className="text-xs text-blue-600">
                                                                Driver: {request.assignedDriver.name}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                            {request.status}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Recent Activity */}
                            <div className="bg-white shadow rounded-lg p-6">
                                <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Emergency Requests</h3>
                                <div className="space-y-4">
                                    {recentRequests.length > 0 ? (
                                        recentRequests.map((request, index) => (
                                            <div key={index} className="flex items-center space-x-3">
                                                <div className="flex-shrink-0">
                                                    <div className={`w-2 h-2 rounded-full ${
                                                        request.type === 'Automatic' ? 'bg-red-400' : 'bg-yellow-400'
                                                    }`}></div>
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-sm text-gray-900">
                                                        {request.type} emergency request - Water level: {request.level}%
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        Status: {request.status} • {request.timestamp}
                                                    </p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <>
                                    <div className="flex items-center space-x-3">
                                        <div className="flex-shrink-0">
                                            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                        </div>
                                        <div className="flex-1">
                                                    <p className="text-sm text-gray-900">System ready - No recent emergency requests</p>
                                                    <p className="text-xs text-gray-500">Water level monitoring active</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-3">
                                        <div className="flex-shrink-0">
                                            <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                                        </div>
                                        <div className="flex-1">
                                                    <p className="text-sm text-gray-900">Automatic emergency requests enabled</p>
                                                    <p className="text-xs text-gray-500">Will trigger when water level drops below 35%</p>
                                        </div>
                                    </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'emergency' && (
                    <div className="px-4 py-6 sm:px-0">
                        <div className="border-4 border-dashed border-gray-200 rounded-lg p-6">
                            <h2 className="text-2xl font-bold text-gray-900 mb-6">Emergency Water Request</h2>
                            
                            <div className="bg-white shadow rounded-lg p-6">
                                <form onSubmit={handleEmergencyRequest} className="space-y-6">
                                    <div>
                                        <label htmlFor="location" className="block text-sm font-medium text-gray-700">
                                            Emergency Location *
                                        </label>
                                        <input
                                            type="text"
                                            id="location"
                                            name="location"
                                            required
                                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-red-500 focus:border-red-500"
                                            placeholder="Enter emergency location"
                                            value={emergencyRequest.location}
                                            onChange={(e) => setEmergencyRequest({...emergencyRequest, location: e.target.value})}
                                        />
                                    </div>

                                    <div>
                                        <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                                            Emergency Description *
                                        </label>
                                        <textarea
                                            id="description"
                                            name="description"
                                            rows={4}
                                            required
                                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-red-500 focus:border-red-500"
                                            placeholder="Describe the emergency situation and water requirements"
                                            value={emergencyRequest.description}
                                            onChange={(e) => setEmergencyRequest({...emergencyRequest, description: e.target.value})}
                                        />
                                    </div>

                                    <div>
                                        <label htmlFor="waterLevel" className="block text-sm font-medium text-gray-700">
                                            Current Water Level *
                                        </label>
                                        <input
                                            type="text"
                                            id="waterLevel"
                                            name="waterLevel"
                                            required
                                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-red-500 focus:border-red-500"
                                            placeholder="e.g., 25%"
                                            value={emergencyRequest.waterLevel}
                                            onChange={(e) => setEmergencyRequest({...emergencyRequest, waterLevel: e.target.value})}
                                        />
                                    </div>

                                    <div>
                                        <label htmlFor="urgency" className="block text-sm font-medium text-gray-700">
                                            Urgency Level *
                                        </label>
                                        <select
                                            id="urgency"
                                            name="urgency"
                                            required
                                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-red-500 focus:border-red-500"
                                            value={emergencyRequest.urgency}
                                            onChange={(e) => setEmergencyRequest({...emergencyRequest, urgency: e.target.value})}
                                        >
                                            <option value="high">High - Immediate response needed</option>
                                            <option value="medium">Medium - Response within 1 hour</option>
                                            <option value="low">Low - Response within 2 hours</option>
                                        </select>
                                    </div>

                                    <div className="bg-red-50 border border-red-200 rounded-md p-4">
                                        <div className="flex">
                                            <div className="flex-shrink-0">
                                                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div className="ml-3">
                                                <h3 className="text-sm font-medium text-red-800">
                                                    Emergency Request Notice
                                                </h3>
                                                <p className="text-sm text-red-700 mt-1">
                                                    This request will be reviewed by the system administrator. 
                                                    The nearest branch will be notified if approved.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className={`w-full py-2 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${
                                            isSubmitting 
                                                ? 'bg-gray-400 text-gray-200 cursor-not-allowed' 
                                                : 'bg-red-600 text-white hover:bg-red-700'
                                        }`}
                                    >
                                        {isSubmitting ? (
                                            <div className="flex items-center justify-center">
                                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                                Submitting...
                                            </div>
                                        ) : (
                                            'Submit Emergency Request'
                                        )}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'map' && (
                    <div className="px-4 py-6 sm:px-0">
                        <div className="border-4 border-dashed border-gray-200 rounded-lg p-6">
                            <h2 className="text-2xl font-bold text-gray-900 mb-6">Branch Locations</h2>
                            
                            <div className="bg-white shadow rounded-lg p-6">
                                <div className="mb-4">
                                    <button
                                        onClick={() => setShowMap(!showMap)}
                                        className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                                    >
                                        {showMap ? 'Hide Map' : 'Show Interactive Map'}
                                    </button>
                                </div>
                                
                                {showMap ? (
                                    <div className="bg-gray-200 rounded-lg h-96 flex items-center justify-center">
                                        <div className="text-center">
                                            <div className="text-6xl mb-4">🗺️</div>
                                            <p className="text-gray-600 text-lg">Interactive Map Loading...</p>
                                            <p className="text-gray-500">Google Maps integration coming soon</p>
                                            <p className="text-gray-500">Will show all AquaLink branches within 50km range</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-gray-100 rounded-lg p-6">
                                        <h3 className="text-lg font-medium text-gray-900 mb-4">Nearby Branches (Within 50km)</h3>
                                        <div className="space-y-4">
                                            <div className="bg-white p-4 rounded-lg shadow">
                                                <h4 className="font-medium text-gray-900">Colombo Branch</h4>
                                                <p className="text-gray-600">Distance: 2.5km</p>
                                                <p className="text-gray-500">Status: Available</p>
                                            </div>
                                            <div className="bg-white p-4 rounded-lg shadow">
                                                <h4 className="font-medium text-gray-900">Kandy Branch</h4>
                                                <p className="text-gray-600">Distance: 15.2km</p>
                                                <p className="text-gray-500">Status: Available</p>
                                            </div>
                                            <div className="bg-white p-4 rounded-lg shadow">
                                                <h4 className="font-medium text-gray-900">Galle Branch</h4>
                                                <p className="text-gray-600">Distance: 45.8km</p>
                                                <p className="text-gray-500">Status: Available</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'profile' && (
                    <div className="px-4 py-6 sm:px-0">
                        <div className="border-4 border-dashed border-gray-200 rounded-lg p-6">
                            <h2 className="text-2xl font-bold text-gray-900 mb-6">Brigade Profile</h2>
                            
                            <div className="bg-white shadow rounded-lg p-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Driver Name</label>
                                        <p className="mt-1 text-sm text-gray-900">{user?.name || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Email</label>
                                        <p className="mt-1 text-sm text-gray-900">{user?.email || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Phone</label>
                                        <p className="mt-1 text-sm text-gray-900">{user?.phone || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Brigade ID</label>
                                        <p className="mt-1 text-sm text-gray-900">{user?.brigadeId || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Brigade Name</label>
                                        <p className="mt-1 text-sm text-gray-900">{user?.brigadeName || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Brigade Location</label>
                                        <p className="mt-1 text-sm text-gray-900">{user?.brigadeLocation || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Vehicle Number</label>
                                        <p className="mt-1 text-sm text-gray-900">{user?.vehicleNumber || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Emergency Contact</label>
                                        <p className="mt-1 text-sm text-gray-900">{user?.emergencyContact || 'N/A'}</p>
                                    </div>
                                </div>
                                
                                <div className="mt-6">
                                    <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">
                                        Edit Profile
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default FireBrigadeDashboard;
