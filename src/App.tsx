import { Navigate, Route, Routes } from 'react-router-dom'
import Login from './pages/Login'
import Chat from './pages/Chat'
import Billing from './pages/Billing'
import Usage from './pages/Usage'
import Settings from './pages/Settings'
import { AuthCallback } from './pages/AuthCallback'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/chat" element={<Chat />} />
      <Route path="/billing" element={<Billing />} />
      <Route path="/usage" element={<Usage />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
