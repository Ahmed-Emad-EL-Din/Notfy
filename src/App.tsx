import { useState, useEffect, useRef } from 'react'
import { Bell, Calendar, User, Settings, CheckCircle, LogOut, Trash2, Pencil } from 'lucide-react'
import { format, isTomorrow } from 'date-fns'
import { subscribeUserToPush } from './lib/pushSubscription'
import { auth } from './lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import AdminPanel from './components/AdminPanel'
import Auth from './components/Auth'
import TaskEditor from './components/TaskEditor'

// Update interfaces
interface Task {
  id: string
  title: string
  description_html?: string
  dueDate: Date
  completed: boolean
  userId: string
  visibility?: string
  groupName?: string
  type?: 'standard' | 'poll'
  pollOptions?: string[]
  showPollResults?: boolean
  votes?: Record<number, Array<{uid: string, anonymous: boolean}>>
  reactions?: Record<string, string[]>
}

interface AppNotification {
  id: string
  title: string
  message: string
  timestamp: Date
  type: 'info' | 'warning' | 'urgent'
}

interface UserData {
  id: string
  email: string
  name: string
  isAdmin: boolean
}

function App() {
  const [currentUser, setCurrentUser] = useState<UserData | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [users, setUsers] = useState<Array<{ id: string; name: string; email: string; isAdmin: boolean }>>([])
  const [isInitializing, setIsInitializing] = useState(true) // true while checking Firebase session
  const [mutedTasks, setMutedTasks] = useState<string[]>([])
  
  // Link Handling state
  const [isProcessingInvite, setIsProcessingInvite] = useState(false)
  
  // Telegram State
  const [telegramStatus, setTelegramStatus] = useState({ checked: false, connected: false, polling: false, attempts: 0 })
  
  // Editing State
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  const processingLogins = useRef(new Set<string>())

  // Listen to Firebase Auth session — restores login on page refresh automatically
  useEffect(() => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // Firebase has an active session — restore it silently
          await handleLogin({
            id: firebaseUser.uid,
            email: firebaseUser.email || '',
            name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
            isAdmin: false // will be updated from MongoDB in handleLogin
          })
          setIsInitializing(false)
        } else {
          // If we are waiting for a redirect, DO NOT hide the loading screen yet
          const isRedirectPending = localStorage.getItem('relaysignal_redirect_pending') === '1'
          
          if (isRedirectPending) {
             console.log("Redirect pending detected, holding loading screen...")
             // Safety timeout: if getRedirectResult doesn't fire within 8s, show login anyway
             setTimeout(() => {
                setIsInitializing(false)
             }, 8000)
             return;
          }

          if (isLocal) {
            // Local dev bypass — only runs if Firebase has no session
            await handleLogin({
              id: 'local-admin-debug',
              email: 'local@dev.com',
              name: 'Local Developer',
              isAdmin: true
            }).catch(console.error)
          }
          setIsInitializing(false)
        }
      } catch (err) {
        console.error("Auth listener error:", err)
        setIsInitializing(false)
      }
    })

    return () => unsubscribe()
  }, [])

  // Handle Invitation Links (e.g. /invite/TOKEN)
  useEffect(() => {
    const handleInvite = async () => {
      if (currentUser && window.location.pathname.startsWith('/invite/')) {
         const token = window.location.pathname.split('/invite/')[1]
         if (token) {
           setIsProcessingInvite(true)
           try {
             const fbToken = await auth.currentUser?.getIdToken() || 'local-debug-token'
             const res = await fetch('/.netlify/functions/api?action=joinAdmin', {
               method: 'POST',
               headers: { 
                 'Content-Type': 'application/json',
                 'Authorization': `Bearer ${fbToken}`
               },
               body: JSON.stringify({ token })
             })
             if (res.ok) {
               alert("Successfully connected to Admin workspace!")
               window.history.replaceState(null, '', '/')
               fetchTasks()
             } else {
               alert("Invalid or expired invite link.")
             }
           } catch (e) {
             console.error(e)
           }
           setIsProcessingInvite(false)
         }
      }
    }
    handleInvite()
  }, [currentUser])

  useEffect(() => {
    if ('Notification' in window) {
      Notification.requestPermission()
    }
  }, [])

  useEffect(() => {
    if (!currentUser || !('serviceWorker' in navigator) || Notification.permission !== 'granted') return

    // Keep track of local timeouts to avoid duplicates if app stays open
    const localTimeouts: Record<string, ReturnType<typeof setTimeout>> = {}

    const scheduleOfflineAlarms = async () => {
      try {
        const registration = await navigator.serviceWorker.ready
        const supportsTriggers = 'showTrigger' in Notification.prototype
        
        let scheduledTags: string[] = []
        if (supportsTriggers) {
           const scheduledNotifications = await registration.getNotifications()
           scheduledTags = scheduledNotifications.map(n => n.tag)
        }

        tasks.forEach(task => {
          const dueTime = new Date(task.dueDate).getTime()
          const now = Date.now()
          const timeUntilDue = dueTime - now
          
          if (!task.completed && timeUntilDue > 0 && !mutedTasks.includes(task.id)) {
            const tag = `task-alarm-${task.id}`

            // The fallback function: sends exactly at due time if app is open,
            // or handles the "is tomorrow" reminder if they just open the app.
            const setupFallback = () => {
                // 1. Exact time timeout if timeUntilDue is acceptable for setTimeout (< 24 days)
                if (timeUntilDue <= 2147483647 && !localTimeouts[tag]) {
                    localTimeouts[tag] = setTimeout(() => {
                        new Notification(`Task Due: ${task.title}`, {
                            body: 'It is time for your task!',
                            icon: '/vite.svg',
                            tag: tag
                        })
                    }, timeUntilDue)
                }

                // 2. Immediate Reminder if the task is due "Tomorrow" and they just logged in
                if (isTomorrow(task.dueDate) && !localTimeouts[`tomorrow-${task.id}`]) {
                    localTimeouts[`tomorrow-${task.id}`] = setTimeout(() => {}, 1) // Just mark as sent
                    new Notification('Task Due Tomorrow', {
                        body: `"${task.title}" is due tomorrow!`,
                        icon: '/vite.svg'
                    })
                }
            }

            if (supportsTriggers) {
                // Use modern offline triggers
                if (!scheduledTags.includes(tag)) {
                  ;(registration as any).showNotification(`Task Due: ${task.title}`, {
                    body: 'It is time for your scheduled task!',
                    icon: '/vite.svg',
                    tag: tag,
                    showTrigger: new (window as any).TimestampTrigger(dueTime)
                  }).catch((e: any) => {
                      console.log('Offline trigger failed, using fallback:', e)
                      setupFallback()
                  })
                }
            } else {
                // Fallback to active-tab timeouts and login reminders
                setupFallback()
            }
          }
        })
      } catch (e) {
        console.error('Service worker offline scheduling error:', e)
      }
    }
    
    scheduleOfflineAlarms()

    // Cleanup timeouts on unmount or tasks change
    return () => {
       Object.values(localTimeouts).forEach(clearTimeout)
    }
  }, [tasks, currentUser])

  // Initial and Polling Telegram Status
  useEffect(() => {
      let interval: any;
      const checkTg = async () => {
          if (!currentUser) return;
          try {
             const token = await auth.currentUser?.getIdToken() || 'local-debug-token'
             const res = await fetch('/.netlify/functions/api?action=checkTelegramStatus', {
                 headers: { 'Authorization': `Bearer ${token}` }
             })
                 if (res.ok) {
                 const data = await res.json()
                  if (data.connected && telegramStatus.polling) {
                      // Browser feedback
                      alert("Successfully Connected to Telegram! ✅")
                  }
                   setTelegramStatus(s => {
                     const newAttempts = s.polling ? s.attempts + 1 : s.attempts;
                     const timeout = newAttempts >= 60; // Max 3 minutes polling (60x3s)
                     if (timeout && s.polling && !data.connected) {
                          alert("Telegram connection timed out. Please check if you really clicked 'Start' in the bot, then try linking again.");
                     }
                     return { 
                         ...s, 
                         checked: true, 
                         connected: data.connected, 
                         polling: data.connected || timeout ? false : s.polling,
                         attempts: timeout ? 0 : newAttempts
                     }
                  })
             }
          } catch(e) {}
      }

      if (currentUser && !telegramStatus.checked) {
          checkTg()
      }

      if (telegramStatus.polling && !telegramStatus.connected) {
          interval = setInterval(checkTg, 3000)
      }
      return () => clearInterval(interval)
  }, [currentUser, telegramStatus.polling, telegramStatus.connected, telegramStatus.checked])



  const fetchTasks = async (overrideUserId?: string) => {
    const targetUserId = overrideUserId || currentUser?.id;
    if (!targetUserId) return
    const token = await auth.currentUser?.getIdToken() || 'local-debug-token'
    const res = await fetch(`/.netlify/functions/api?action=getTasks&userId=${targetUserId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (res.ok) {
      const data = await res.json()
      const fetchedTasks = data.map((d: any) => ({
        id: d._id,
        title: d.title,
        description_html: d.description_html,
        dueDate: new Date(d.due_date),
        completed: d.completed,
        userId: d.user_id,
        visibility: d.visibility || 'personal',
        groupName: d.groupName,
        type: d.type || 'standard',
        pollOptions: d.pollOptions || [],
        showPollResults: d.showPollResults !== undefined ? d.showPollResults : true,
        reactions: d.reactions || {},
        votes: d.votes || {}
      }))
      // Sort nearest first (due_date)
      setTasks(fetchedTasks.sort((a: Task, b: Task) => a.dueDate.getTime() - b.dueDate.getTime()))
    }
  }

  // Auto-sync Upcoming Events sidebar with pending tasks
  useEffect(() => {
    const now = new Date()
    const upcoming = tasks
      .filter(t => !t.completed && t.dueDate.getTime() > now.getTime() && !mutedTasks.includes(t.id))
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      .map(task => {
        const diffMs = task.dueDate.getTime() - now.getTime()
        const diffHours = Math.round(diffMs / (1000 * 60 * 60))
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
        const urgency = diffHours <= 24 ? 'urgent' : diffDays <= 3 ? 'warning' : 'info'
        const timeLabel = diffDays > 1 ? `in ${diffDays} days` : diffHours > 0 ? `in ${diffHours} hours` : 'soon'

        return {
          id: `upcoming-${task.id}`,
          title: `📌 Upcoming: ${task.title}`,
          message: `Due ${timeLabel}`,
          timestamp: task.dueDate,
          type: urgency as 'info' | 'warning' | 'urgent'
        }
      })
    setNotifications(upcoming)
  }, [tasks])

  const handleLogin = async (user: UserData) => {
    // Prevent redundant concurrent calls for the same user
    if (processingLogins.current.has(user.id)) return
    processingLogins.current.add(user.id)

    try {
        setCurrentUser(user)
        setIsAdmin(user.isAdmin)
        
        subscribeUserToPush(user.id)
        
        const token = await auth.currentUser?.getIdToken() || 'local-debug-token'
        const upsertRes = await fetch('/.netlify/functions/api?action=upsertUser', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            id: user.id,
            email: user.email,
            name: user.name,
            is_admin: user.isAdmin
          })
        })

        if (upsertRes.ok) {
            const dbUser = await upsertRes.json();
            // Sync the actual admin status from DB
            setIsAdmin(dbUser.is_admin);
            setCurrentUser(prev => prev ? { ...prev, isAdmin: dbUser.is_admin } : prev);
            setMutedTasks(dbUser.muted_tasks || []);
            
            await fetchTasks(user.id)
            
            // Load admin's linked users if admin
            if (dbUser.is_admin) {
              const userRes = await fetch(`/.netlify/functions/api?action=getLinkedUsers`, {
                headers: { 'Authorization': `Bearer ${token}` }
              })
              if (userRes.ok) {
                setUsers(await userRes.json())
              }
            }
        }
    } finally {
        processingLogins.current.delete(user.id)
    }
  }

  const handleLogout = () => {
    setCurrentUser(null)
    setIsAdmin(false)
    setShowAdminPanel(false)
  }

  const handleDeleteAccount = async () => {
      if (!currentUser) return
      if (confirm("Are you sure you want to completely delete your account? This action cannot be undone.")) {
         const token = await auth.currentUser?.getIdToken() || 'local-debug-token'
         await fetch('/.netlify/functions/api?action=deleteAccount', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
         })
         handleLogout()
      }
  }

  const handleCreateTaskObj = async (taskObj: any) => {
    if (!currentUser) return
    const idToken = await auth.currentUser?.getIdToken() || 'local-debug-token'
    
    // If we have an ID, it's an update (PUT), otherwise it's a create (POST)
    const isUpdate = !!taskObj.id
    const action = isUpdate ? 'updateTask' : 'addTask'
    const method = isUpdate ? 'PUT' : 'POST'

    const res = await fetch(`/.netlify/functions/api?action=${action}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        ...taskObj,
        user_id: currentUser.id
      })
    })

    if (res.ok) {
      if (isUpdate) {
          setTasks(tasks.map(t => t.id === taskObj.id ? { ...t, ...taskObj, dueDate: new Date(taskObj.due_date) } : t))
          setEditingTask(null)
          alert("Task updated successfully!")
      } else {
          const newTask = await res.json()
          const taskModel = {
            id: newTask._id,
            title: newTask.title,
            description_html: newTask.description_html,
            dueDate: new Date(newTask.due_date),
            completed: newTask.completed,
            userId: newTask.user_id,
            visibility: newTask.visibility
          }
          const newList = [...tasks, taskModel].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
          setTasks(newList)
      }
    } else {
        const errData = await res.json().catch(() => ({}));
        alert(`Failed to save task. Server Error: ${errData.error || res.statusText || 'Unknown'}`);
    }
  }

  const handleEditTask = (task: Task) => {
    setEditingTask(task)
    document.getElementById('task-editor')?.scrollIntoView({ behavior: 'smooth' })
  }

  const toggleTaskCompletion = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (task) {
      if (!isAdmin && task.userId !== currentUser?.id) return

      const token = await auth.currentUser?.getIdToken() || 'local-debug-token'
      await fetch('/.netlify/functions/api?action=updateTask', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ id: taskId, completed: !task.completed })
      })
      setTasks(tasks.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t))
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!currentUser) return
    if (!confirm("Are you sure you want to delete this task?")) return

    const token = await auth.currentUser?.getIdToken() || 'local-debug-token'
    const res = await fetch('/.netlify/functions/api?action=deleteTask', {
      method: 'DELETE',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ id: taskId })
    })

    if (res.ok) {
      setTasks(tasks.filter(t => t.id !== taskId))
    }
  }

  const handleToggleMute = async (taskId: string) => {
    if (!currentUser) return;
    const token = await auth.currentUser?.getIdToken() || 'local-debug-token'
    const res = await fetch('/.netlify/functions/api?action=toggleMute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ id: taskId })
    })
    if (res.ok) {
        const data = await res.json()
        setMutedTasks(data.muted_tasks)
    }
  }

  const handleReactTask = async (taskId: string, emoji: string) => {
    const token = await auth.currentUser?.getIdToken() || 'local-debug-token'
    const res = await fetch('/.netlify/functions/api?action=reactTask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ id: taskId, emoji })
    })
    if (res.ok) {
        const data = await res.json()
        setTasks(tasks.map(t => t.id === taskId ? { ...t, reactions: data.reactions } : t))
    }
  }

  const handleVoteTask = async (taskId: string, optionIndex: number, anonymous: boolean) => {
    const token = await auth.currentUser?.getIdToken() || 'local-debug-token'
    const res = await fetch('/.netlify/functions/api?action=voteTask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ id: taskId, optionIndex, anonymous })
    })
    if (res.ok) {
        const data = await res.json()
        setTasks(tasks.map(t => t.id === taskId ? { ...t, votes: data.votes } : t))
    }
  }

  const handleUnlinkAdmin = async () => {
     const admin_id = prompt("Enter the ID of the Admin Workspace you want to unlink (found in invite link):");
     if (admin_id) {
         const token = await auth.currentUser?.getIdToken() || 'local-debug-token'
         await fetch('/.netlify/functions/api?action=unlinkAdmin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ admin_id })
         })
         alert("Workspace Unlinked.");
         window.location.reload();
     }
  }

  // Show a loading screen while Firebase checks for an existing session
  if (isInitializing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <Bell className="h-12 w-12 text-blue-600 mb-4 animate-pulse" />
        <p className="text-lg font-medium text-gray-600">Loading RelaySignal...</p>
      </div>
    )
  }

  if (!currentUser) {
    // If user has never visited before (no localStorage flag), show Sign Up by default
    const hasVisitedBefore = !!localStorage.getItem('relaysignal_visited')
    return <Auth onLogin={handleLogin} defaultToSignUp={!hasVisitedBefore} />
  }

  const handleTestTelegram = async () => {
    const token = await auth.currentUser?.getIdToken() || 'local-debug-token'
    const res = await fetch('/.netlify/functions/api?action=testTelegram', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (res.ok) alert("Test message sent! Check your Telegram.")
  }

  const handleDisconnectTelegram = async () => {
    if (!confirm("Disconnect Telegram notifications?")) return
    const token = await auth.currentUser?.getIdToken() || 'local-debug-token'
    const res = await fetch('/.netlify/functions/api?action=disconnectTelegram', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (res.ok) {
        setTelegramStatus(s => ({ ...s, connected: false }))
        alert("Telegram disconnected.")
    }
  }

  // Mark as visited once logged in
  localStorage.setItem('relaysignal_visited', '1')

  if (isProcessingInvite) {
      return <div className="min-h-screen flex items-center justify-center bg-gray-100"><p className="text-xl">Linking to Admin Workspace...</p></div>
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Bell className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">RelaySignal</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              {isAdmin && (
                <button
                  onClick={() => setShowAdminPanel(!showAdminPanel)}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-blue-600 text-white shadow-sm hover:bg-blue-700 transition"
                >
                  <Settings className="h-4 w-4" />
                  <span>{showAdminPanel ? 'User View' : 'Admin Panel'}</span>
                </button>
              )}
              
              <div className="relative group">
                <div className="flex items-center space-x-2 cursor-pointer p-2 rounded-md hover:bg-gray-50">
                  <User className="h-6 w-6 text-gray-600" />
                  <span className="text-sm font-medium text-gray-700">{currentUser.name}</span>
                </div>
                {/* Simple Dropdown mapping */}
                <div className="absolute right-0 top-full mt-2 w-56 bg-white max-h-0 overflow-hidden group-hover:max-h-60 transition-all duration-300 shadow-xl rounded-md border border-gray-100">
                   
                   {!telegramStatus.connected ? (
                      <div className="border-b">
                        <button 
                          disabled={telegramStatus.polling}
                          onClick={async () => {
                             setTelegramStatus(s => ({ ...s, polling: true, attempts: 0 }))
                             const token = await auth.currentUser?.getIdToken() || 'local-debug-token'
                             fetch('/.netlify/functions/api?action=registerWebhook', {
                                 method: 'POST',
                                 headers: { 'Authorization': `Bearer ${token}` }
                             }).catch(() => {});
                             window.location.href = `tg://resolve?domain=RelaySignals_bot&start=${currentUser.id}`;
                          }} 
                          className={`w-full text-left px-4 py-3 text-sm flex items-center ${telegramStatus.polling ? 'text-gray-400 bg-gray-50' : 'text-blue-600 hover:bg-blue-50'}`}
                        >
                           <Bell className={`h-4 w-4 mr-2 ${telegramStatus.polling ? 'animate-bounce' : ''}`}/> 
                           <span>{telegramStatus.polling ? 'Waiting for Bot...' : 'Connect Telegram App'}</span>
                        </button>
                        {telegramStatus.polling && (
                          <div className="px-4 pb-3 text-[10px] text-gray-400">
                             Didn't open? <a href={`https://t.me/RelaySignals_bot?start=${currentUser.id}`} target="_blank" className="text-blue-500 underline ml-1">Try the web version</a>
                          </div>
                        )}
                      </div>
                   ) : (
                     <>
                        <div className="px-4 py-3 text-sm text-green-600 font-medium border-b flex items-center bg-green-50/50">
                           <CheckCircle className="h-4 w-4 mr-2" />
                           Telegram Linked
                        </div>
                        <button 
                           onClick={handleTestTelegram}
                           className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center border-b"
                        >
                           <Bell className="h-4 w-4 mr-2 text-blue-500"/> 
                           Send Test Notification
                        </button>
                        <button 
                           onClick={handleDisconnectTelegram}
                           className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 flex items-center border-b"
                        >
                           <Trash2 className="h-4 w-4 mr-2"/> 
                           Disconnect Telegram
                        </button>
                     </>
                   )}

                   <button onClick={handleUnlinkAdmin} className="w-full text-left px-4 py-3 text-sm text-yellow-600 hover:bg-yellow-50 flex items-center border-b">
                      <LogOut className="h-4 w-4 mr-2"/> Unlink Workspace
                   </button>
                   <button onClick={handleDeleteAccount} className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 flex items-center">
                      <Trash2 className="h-4 w-4 mr-2"/> Delete Account
                   </button>
                   <button onClick={handleLogout} className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center">
                      <LogOut className="h-4 w-4 mr-2"/> Sign Out
                   </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {showAdminPanel ? (
          <AdminPanel 
            isAdmin={isAdmin}
            onToggleAdmin={() => setIsAdmin(!isAdmin)}
            onSendNotification={(n: any) => setNotifications([n, ...notifications])} // Stubbed for now
            users={users}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-800 flex items-center">
                  <Calendar className="h-5 w-5 mr-2 text-blue-500" />
                  My Tasks
                </h2>
                <span className="text-sm px-3 py-1 bg-blue-50 text-blue-600 rounded-full font-medium">
                  {tasks.filter(t => !t.completed).length} pending
                </span>
              </div>

              <div className="mb-8">
                  <TaskEditor 
                    onSave={handleCreateTaskObj} 
                    isAdmin={isAdmin} 
                    initialTask={editingTask}
                    onCancel={() => setEditingTask(null)}
                  />
              </div>

              <div className="space-y-8">
                {Object.entries(
                   tasks.reduce((acc, t) => {
                       const g = t.groupName || 'Ungrouped Tasks';
                       if (!acc[g]) acc[g] = [];
                       acc[g].push(t);
                       return acc;
                   }, {} as Record<string, Task[]>)
                ).map(([groupString, groupTasks]) => (
                  <div key={groupString} className="space-y-4">
                     <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider pl-2 border-l-4 border-blue-400">{groupString}</h3>
                     
                     {groupTasks.map((task) => (
                      <div
                        key={task.id}
                        className={`p-4 border rounded-xl shadow-sm transition-all ${
                          task.completed ? 'bg-green-50/50 border-green-200 opacity-75' : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-md'
                        }`}
                      >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                           {(task.userId === currentUser.id || isAdmin) && (
                             <button
                               onClick={() => toggleTaskCompletion(task.id)}
                               className={`p-1 rounded-full transition-colors ${
                                 task.completed ? 'text-green-500 bg-green-100' : 'text-gray-400 hover:text-green-500 hover:bg-green-50'
                               }`}
                             >
                               <CheckCircle className="h-6 w-6" />
                             </button>
                           )}
                           <h3 className={`text-lg font-medium ${task.completed ? 'text-green-800 line-through' : 'text-gray-900'}`}>
                             {task.title}
                             {task.userId !== currentUser.id && (
                                 <span className="ml-2 text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">From Admin</span>
                             )}
                           </h3>
                        </div>
                        {task.description_html && (
                          <div 
                             className="text-sm text-gray-600 mt-3 ml-11 prose prose-sm max-w-none"
                             dangerouslySetInnerHTML={{__html: task.description_html}}
                          />
                        )}
                        
                        {task.type === 'poll' && (
                           <div className="mt-4 ml-11 bg-gray-50 border p-3 rounded-lg max-w-sm">
                              <h4 className="text-sm font-semibold mb-2">Vote on Option:</h4>
                              {task.pollOptions?.map((opt, idx) => {
                                  const votedHere = task.votes && task.votes[idx] && task.votes[idx].some(v => v.uid === currentUser.id);
                                  const totalVotes = task.votes ? Object.values(task.votes).reduce((acc, curr) => acc + curr.length, 0) : 0;
                                  const optVotes = task.votes && task.votes[idx] ? task.votes[idx].length : 0;
                                  const pct = totalVotes ? Math.round((optVotes / totalVotes) * 100) : 0;
                        
                                  return (
                                     <div key={idx} className="mb-2">
                                         <div className="flex items-center">
                                            <input type="radio" 
                                               name={`poll-${task.id}`} 
                                               checked={votedHere || false}
                                               onChange={() => {
                                                   const isAnon = confirm("Vote anonymously? (Your name will be hidden from the admin)");
                                                   handleVoteTask(task.id, idx, isAnon);
                                               }}
                                               className="mr-2 cursor-pointer"
                                            />
                                            <span className="text-sm cursor-pointer">{opt}</span>
                                         </div>
                                         {task.showPollResults && totalVotes > 0 && (
                                             <div className="w-full bg-gray-200 h-1.5 mt-1.5 rounded-full overflow-hidden">
                                                <div className="bg-blue-500 h-full" style={{ width: `${pct}%` }}></div>
                                             </div>
                                         )}
                                         {task.showPollResults && <div className="text-xs text-gray-400 mt-1">{optVotes} votes ({pct}%)</div>}
                                     </div>
                                  )
                              })}
                           </div>
                        )}
                        
                        <div className="ml-11 flex items-center space-x-2 mt-4 flex-wrap gap-y-2">
                            {['👍', '❤️', '👀', '🔥'].map(emoji => {
                                const reacted = task.reactions && task.reactions[emoji] && task.reactions[emoji].includes(currentUser.id);
                                const count = task.reactions && task.reactions[emoji] ? task.reactions[emoji].length : 0;
                                return (
                                   <button 
                                      key={emoji}
                                      onClick={() => handleReactTask(task.id, emoji)}
                                      className={`text-sm px-2.5 py-1 rounded-md transition duration-200 ease-in-out ${reacted ? 'bg-blue-100 text-blue-700 font-bold border border-blue-200 shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-transparent'}`}
                                   >
                                      {emoji} {count > 0 && <span className="ml-1 opacity-80">{count}</span>}
                                   </button>
                                )
                            })}
                        </div>
                        
                        <div className="flex items-center justify-between mt-5 ml-11 border-t pt-4 border-gray-100">
                          <p className="text-xs text-gray-500 font-medium bg-gray-100/80 inline-block px-2.5 py-1.5 rounded-md flex items-center">
                            Due: {format(task.dueDate, 'MMM dd, yyyy HH:mm')}
                          </p>
                          <div className="flex items-center space-x-1">
                            <button 
                                onClick={() => handleToggleMute(task.id)}
                                className="text-gray-400 hover:text-yellow-500 transition-colors p-1.5 rounded-md hover:bg-yellow-50"
                                title={mutedTasks.includes(task.id) ? "Unmute Notifications" : "Mute Notifications"}
                            >
                                {mutedTasks.includes(task.id) ? "🔕" : "🔔"}
                            </button>
                            {(task.userId === currentUser.id || isAdmin) && (
                              <button
                                onClick={() => handleEditTask(task)}
                                className="text-gray-400 hover:text-blue-500 transition-colors p-1"
                                title="Edit task"
                              >
                                <Pencil className="h-5 w-5" />
                              </button>
                            )}
                            {(task.userId === currentUser.id || isAdmin) && (
                              <button
                                onClick={() => handleDeleteTask(task.id)}
                                className="text-gray-400 hover:text-red-500 transition-colors p-1"
                                title="Delete task"
                              >
                                <Trash2 className="h-5 w-5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                </div>
                ))}
                
                {tasks.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    <Calendar className="h-16 w-16 mx-auto mb-4 opacity-30 text-blue-500" />
                    <p className="text-lg">No tasks yet. Add your first task above!</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-800 flex items-center">
                  <Bell className="h-5 w-5 mr-2 text-yellow-500" />
                  Notifications
                </h2>
                <span className="text-sm px-3 py-1 bg-yellow-50 text-yellow-700 rounded-full font-medium">
                   {notifications.length} total
                </span>
              </div>

              <div className="space-y-4">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 border rounded-xl shadow-sm transition-all ${
                      notification.type === 'urgent' ? 'bg-red-50 border-red-200' :
                      notification.type === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                      'bg-blue-50 border-blue-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{notification.title}</h3>
                        <p className="text-sm text-gray-700 mt-1.5 leading-relaxed">{notification.message}</p>
                        <p className="text-xs text-gray-500 mt-3 font-medium">
                          {format(notification.timestamp, 'MMM dd, yyyy HH:mm')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                
                {notifications.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    <Bell className="h-16 w-16 mx-auto mb-4 opacity-30 text-yellow-500" />
                    <p className="text-lg">No notifications yet.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 mt-auto py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-gray-500 font-medium tracking-wide">
            Made By: Ahmed Emad
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App