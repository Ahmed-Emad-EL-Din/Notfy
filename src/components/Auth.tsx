import { useState, useEffect } from 'react'
import { Mail, Lock, User, LogIn, AlertCircle } from 'lucide-react'
import { auth } from '../lib/firebase'
import { 
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword
} from 'firebase/auth'

interface AuthProps {
  onLogin: (user: any) => void
  defaultToSignUp?: boolean
}

function Auth({ onLogin, defaultToSignUp = false }: AuthProps) {
  const [isLogin, setIsLogin] = useState(!defaultToSignUp) // false = show Sign Up
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    confirmPassword: ''
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [verificationSent, setVerificationSent] = useState(false)
  const [selectedRole, setSelectedRole] = useState<'user' | 'admin'>('user')

  // Friendly error messages instead of raw Firebase codes
  const getFriendlyError = (err: any): string => {
    const code = err.code || ''
    const messages: Record<string, string> = {
      'auth/user-not-found':        'No account found with this email. Please sign up first.',
      'auth/wrong-password':        'Incorrect password. Please try again.',
      'auth/invalid-credential':    'Incorrect email or password. Please try again.',
      'auth/email-already-in-use':  'An account with this email already exists. Try signing in.',
      'auth/weak-password':         'Password must be at least 6 characters.',
      'auth/invalid-email':         'Please enter a valid email address.',
      'auth/too-many-requests':     'Too many failed attempts. Please wait a few minutes and try again.',
      'auth/network-request-failed':'Network error. Please check your internet connection.',
      'auth/unauthorized-domain':   'Login is blocked: this domain is not authorized in Firebase. Go to Firebase Console → Authentication → Settings → Authorized Domains and add this site\'s domain.',
    }
    return messages[code] || err.message || 'Authentication failed. Please try again.'
  }

  // Must be defined before useEffect since it's referenced inside it
  const handleAuthResult = async (userCredential: any, isNewSignup = false) => {
    const user = userCredential.user

    // Email verification check disabled to prevent redirect loops.
    // Users can now enter the app immediately after signup.
    
    onLogin({
      id: user.uid,
      email: user.email,
      name: user.displayName || formData.name || user.email?.split('@')[0] || 'User',
      isAdmin: isNewSignup ? (selectedRole === 'admin') : false // Role is only picked during new signup
    })
  }

  // Handle the redirect result when the user returns from Google sign-in
  useEffect(() => {
    setLoading(true)
    getRedirectResult(auth)
      .then(async (result) => {
        if (result) {
          await handleAuthResult(result)
        }
      })
      .catch((err) => {
        if (err.code !== 'auth/popup-closed-by-user') {
          setError(getFriendlyError(err))
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!auth) return setError("Firebase not configured. Check your environment variables.")

    setError(null)
    setLoading(true)

    try {
      if (!isLogin && formData.password !== formData.confirmPassword) {
        throw new Error('Passwords do not match')
      }

      if (isLogin) {
        const result = await signInWithEmailAndPassword(auth, formData.email, formData.password)
        await handleAuthResult(result, false) // not a signup
      } else {
        const result = await createUserWithEmailAndPassword(auth, formData.email, formData.password)
        await handleAuthResult(result, true) // is a signup
      }
    } catch (err: any) {
      console.error(err)
      setError(getFriendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    if (!auth) return setError("Firebase configuration missing.")
    setError(null)
    setLoading(true)
    try {
      const provider = new GoogleAuthProvider()
      // Use redirect instead of popup — works on all browsers without popup blocker issues
      await signInWithRedirect(auth, provider)
      // Page will redirect to Google and come back. Result handled in useEffect above.
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Google Auth failed')
      setLoading(false)
    }
  }

  if (verificationSent) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow p-8 max-w-md w-full text-center">
          <Mail className="h-12 w-12 mx-auto text-blue-600 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900">Verify Your Email</h2>
          <p className="text-gray-600 mt-2 mb-6">
            We sent a verification link to <strong>{formData.email}</strong>. Please check your inbox and click the link inside. Then click the button below.
          </p>
          <button
            onClick={() => {
              setVerificationSent(false)
              setIsLogin(true)
            }}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            I've Verified My Email
          </button>
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
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-start">
            <AlertCircle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
            <p className="break-words">{error}</p>
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center space-x-2 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 mb-4 disabled:opacity-50"
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
            <>
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 mt-4">
                  Join as
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedRole('user')}
                    className={`p-3 border rounded-lg text-sm transition-all text-center ${
                      selectedRole === 'user' 
                        ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200' 
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-bold mb-0.5 text-xs">Regular User</div>
                    <div className="text-[10px] opacity-70">Personal tasks</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRole('admin')}
                    className={`p-3 border rounded-lg text-sm transition-all text-center ${
                      selectedRole === 'admin' 
                        ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200' 
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-bold mb-0.5 text-xs">Admin</div>
                    <div className="text-[10px] opacity-70">Team tasks</div>
                  </button>
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div className="text-center mt-4">
          <button
            onClick={() => {
              setIsLogin(!isLogin)
              setError(null)
            }}
            className="text-blue-600 hover:text-blue-800"
          >
            {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Auth