import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ItineraryProvider } from "./context/ItineraryContext";
import Home from "./Home";
import Login from "./Login";
import Register from "./Register";
import About from "./About";
import Destinations from "./Destinations";
import DestinationDetail from "./DestinationDetail";
import Attractions from "./Attractions";
import Hotels from "./Hotels";
import Planner from "./Planner";
import Budget from "./Budget";
import Profile from "./Profile";
import Weather from "./Weather";
import Dashboard from "./Dashboard";
import Transport from "./Transport";
import Admin from "./Admin";

// Guard: redirect to register if not logged in (keeps "from" path for after login)
function ProtectedRoute({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/register" state={{ from: location.pathname }} replace />;
  return children;
}

function AdminRoute({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/register" state={{ from: location.pathname }} replace />;
  }

  if (user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  return (
    <AuthProvider>
      <ItineraryProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/destinations" element={<ProtectedRoute><Destinations /></ProtectedRoute>} />
            <Route path="/destinations/:id" element={<ProtectedRoute><DestinationDetail /></ProtectedRoute>} />
            <Route path="/attractions" element={<ProtectedRoute><Attractions /></ProtectedRoute>} />
            <Route path="/hotels" element={<ProtectedRoute><Hotels /></ProtectedRoute>} />
            <Route path="/planner" element={<ProtectedRoute><Planner /></ProtectedRoute>} />
            <Route path="/budget" element={<ProtectedRoute><Budget /></ProtectedRoute>} />
            <Route path="/weather" element={<ProtectedRoute><Weather /></ProtectedRoute>} />
            <Route path="/transport" element={<ProtectedRoute><Transport /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
          </Routes>
        </BrowserRouter>
      </ItineraryProvider>
    </AuthProvider>
  );
}

export default App;
