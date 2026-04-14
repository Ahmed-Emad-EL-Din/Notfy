import { useState } from 'react'
import { Mail, Lock, User, LogIn } from 'lucide-react'

interface AuthProps {
  onLogin: (user: { id: string; email: string; name: string; isAdmin: boolean; invitedBy?: string }) => void
  invitationCode?: string
}

function Auth({ onLogin, invitationCode }: AuthProps) {
  const [isLogin, setIsLogin] = useState(true)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    confirmPassword: ''
  })
  const [verificationCode, setVerificationCode] = useState('')
  const [showVerification, setShowVerification] = useState(false)
  const [invitationInfo] = useState(invitationCode ? {
    isValid: true,
    isAdminInvite: invitationCode.includes('admin'),
    inviterName: 'Administrator'
  } : null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!isLogin && formData.password !== formData.confirmPassword) {
      alert('Passwords do not match')
      return
    }

    if (isLogin) {
      // Simulate login
      const userData = {
        id: 'user-' + Date.now(),
        email: formData.email,
        name: formData.email.split('@')[0],
        isAdmin: formData.email.includes('admin')
      }
      
      if (invitationCode) {
        // @ts-ignore
        userData.invitedBy = 'admin-' + Date.now()
      }
      
      onLogin(userData)
    } else {
      // Show verification for signup
      setShowVerification(true)
    }
  }

  const handleVerification = () => {
    if (verificationCode === '123456') { // Simulated verification
      const userData = {
        id: 'user-' + Date.now(),
        email: formData.email,
        name: formData.name || formData.email.split('@')[0],
        isAdmin: formData.email.includes('admin')
      }
      
      if (invitationCode) {
        // @ts-ignore
        userData.invitedBy = 'admin-' + Date.now()
      }
      
      onLogin(userData)
    } else {
      alert('Invalid verification code')
    }
  }

  const handleGoogleLogin = () => {
    // Simulate Google login
    onLogin({
      id: 'google-user-' + Date.now(),
      email: 'user@gmail.com',
      name: 'Google User',
      isAdmin: false
    })
  }

  if (showVerification) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <Mail className="h-12 w-12 mx-auto text-blue-600 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900">Verify Your Email</h2>
            <p className="text-gray-600 mt-2">
              We sent a verification code to {formData.email}
            </p>
            {invitationInfo && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-700">
                  📧 Invited by {invitationInfo.inviterName}
                  {invitationInfo.isAdminInvite && ' (Administrator)'}
                </p>
              </div>
            )}
          </div>
          
          <form onSubmit={(e) => { e.preventDefault(); handleVerification() }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Verification Code
              </label>
              <input
                type="text"
                placeholder="Enter 6-digit code"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            
            <button
              type="submit"
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Verify & Continue
            </button>
            
            <button
              type="button"
              onClick={() => setShowVerification(false)}
              className="w-full px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Back to Sign Up
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <LogIn className="h-12 w-12 mx-auto text-blue-600 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900">
              {isLogin ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="text-gray-600 mt-2">
              {isLogin ? 'Sign in to your account' : 'Get started with Notfy'}
            </p>
            {invitationInfo && (
              <div className="mt-4 p-3 bg-green-50 rounded-lg">
                <p className="text-sm text-green-700">
                  🎉 You've been invited! {invitationInfo.isAdminInvite ? 
                    'You will receive administrator notifications' : 
                    'You will receive user notifications'}
                </p>
              </div>
            )}
          </div>

        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center space-x-2 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 mb-4"
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" className="h-5 w-5" />
          <span>Continue with Google</span>
        </button>

        <div className="relative mb-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">Or continue with email</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required={!isLogin}
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <input
                type="email"
                placeholder="Enter your email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <input
                type="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                <input
                  type="password"
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            {isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="text-center mt-4">
        <button
          onClick={() => setIsLogin(!isLogin)}
          className="text-blue-600 hover:text-blue-800"
        >
          {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
        
        {isLogin && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-600 text-center mb-2">Need admin access?</p>
            <button
              onClick={() => {
                setFormData({
                  email: 'admin@notfy.com',
                  password: 'admin123',
                  name: '',
                  confirmPassword: ''
                })
              }}
              className="w-full px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm"
            >
              Use Admin Demo Account
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

export default Auth