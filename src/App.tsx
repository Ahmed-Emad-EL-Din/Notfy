import { useState, useEffect, useRef } from 'react'
import { Bell, Calendar, User, Settings, CheckCircle, LogOut, Trash2, Pencil, Link, Users } from 'lucide-react'
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
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  pollOptions?: string[]
  showPollResults?: boolean
  votes?: Record<number, Array<{uid: string, anonymous: boolean}>>
  reactions?: Record<string, string[]>
  recurrence?: { frequency: 'daily' | 'weekly' | 'monthly'; interval: number }
  attachments?: Array<{ url: string; name: string; mimeType: string; size: number }>
}

interface AppNotification {
  id: string
  title: string
  message: string
  timestamp: Date
  type: 'info' | 'warning' | 'urgent'
  isRead?: boolean
  taskId?: string
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
  const [activeTab, setActiveTab] = useState<'tasks' | 'notifications'>('tasks')
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false)
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'info' | 'warning' | 'urgent'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'pending'>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'standard' | 'poll'>('all')
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'low' | 'medium' | 'high' | 'urgent'>('all')
  const [sortMode, setSortMode] = useState<'dueSoonest' | 'newest'>('newest')
  const [activityByTask, setActivityByTask] = useState<Record<string, Array<{ id: string; detail: string; created_at: string; actor_id: string; action: string }>>>({})

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

          if (isLocal && !localStorage.getItem('relaysignal_manually_signed_out')) {
            // Local dev auto-login ONLY if we haven't explicitly signed out
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
        priority: d.priority || 'medium',
        pollOptions: d.pollOptions || [],
        showPollResults: d.showPollResults !== undefined ? d.showPollResults : true,
        reactions: d.reactions || {},
        votes: d.votes || {},
        recurrence: d.recurrence,
        attachments: d.attachments || []
      }))
      // Sort nearest first (due_date)
      setTasks(fetchedTasks.sort((a: Task, b: Task) => a.dueDate.getTime() - b.dueDate.getTime()))
    }
  }

  const fetchNotifications = async () => {
    if (!currentUser) return
    const token = await auth.currentUser?.getIdToken() || 'local-debug-token'
    const typeQuery = notificationFilter === 'all' ? '' : `&type=${notificationFilter}`
    const res = await fetch(`/.netlify/functions/api?action=getNotifications${typeQuery}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (!res.ok) return
    const data = await res.json()
    if (!Array.isArray(data)) {
      setNotifications([])
      return
    }
    const mapped: AppNotification[] = data.map((n: any) => ({
      id: n._id,
      title: n.title,
      message: n.message,
      timestamp: new Date(n.created_at),
      type: n.type || 'info',
      isRead: !!n.is_read,
      taskId: n.task_id
    }))
    setNotifications(mapped)
  }

  const fetchTaskActivity = async (taskId: string) => {
    const token = await auth.currentUser?.getIdToken() || 'local-debug-token'
    const res = await fetch(`/.netlify/functions/api?action=getTaskActivity&taskId=${taskId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (!res.ok) return
    const data = await res.json()
    setActivityByTask(prev => ({ ...prev, [taskId]: data.map((a: any) => ({ id: a._id, ...a })) }))
  }

  useEffect(() => {
    if (!currentUser) return
    fetchNotifications().catch(console.error)
  }, [currentUser, notificationFilter])

  const handleLogin = async (user: UserData) => {
    // If we're already logged in with this ID and the admin status matches, skip
    if (currentUser?.id === user.id && isAdmin === user.isAdmin) return
    
    // Set base profile immediately so authenticated users are not stuck on Auth UI
    setCurrentUser(user)

    // Always prioritize 'true' for admin status during the transition
    if (user.isAdmin) setIsAdmin(true)
    
    if (processingLogins.current.has(user.id)) return
    processingLogins.current.add(user.id)

    try {
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
            await fetchNotifications()
            
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
    auth.signOut()
    setCurrentUser(null)
    setIsAdmin(false)
    setShowAdminPanel(false)
    setTasks([])
    setUsers([])
    // Prevent local dev from auto-logging back in immediately
    localStorage.setItem('relaysignal_manually_signed_out', '1')
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
            visibility: newTask.visibility,
            recurrence: newTask.recurrence,
            attachments: newTask.attachments || [],
            type: newTask.type || 'standard',
            pollOptions: newTask.pollOptions || [],
            showPollResults: newTask.showPollResults !== undefined ? newTask.showPollResults : true,
            reactions: newTask.reactions || {},
            votes: newTask.votes || {}
          }
          const newList = [...tasks, taskModel].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
          setTasks(newList)
      }
    } else {
        const text = await res.text().catch(() => '');
        let errorMsg = 'Unknown';
        try {
            const errData = JSON.parse(text);
            errorMsg = errData.error || res.statusText || 'Unknown';
        } catch (e) {
            errorMsg = `Server Response (${res.status}): ${text.substring(0, 100)}`;
        }
        alert(`Failed to save task. ${errorMsg}`);
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

  const handleMarkNotificationRead = async (notificationId: string, isRead: boolean) => {
    const token = await auth.currentUser?.getIdToken() || 'local-debug-token'
    const res = await fetch('/.netlify/functions/api?action=markNotificationRead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id: notificationId, is_read: isRead })
    })
    if (res.ok) {
      setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, isRead } : n))
    }
  }

  const handleClearNotifications = async () => {
    const token = await auth.currentUser?.getIdToken() || 'local-debug-token'
    const res = await fetch('/.netlify/functions/api?action=clearNotifications', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (res.ok) {
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
    }
  }

  const handleSnoozeTask = async (taskId: string) => {
    const token = await auth.currentUser?.getIdToken() || 'local-debug-token'
    const res = await fetch('/.netlify/functions/api?action=snoozeTask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id: taskId, minutes: 30 })
    })
    if (res.ok) {
      const data = await res.json()
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, dueDate: new Date(data.due_date), completed: false } : t))
      fetchTaskActivity(taskId).catch(console.error)
    }
  }

  const handleSkipOccurrence = async (taskId: string) => {
    const token = await auth.currentUser?.getIdToken() || 'local-debug-token'
    const res = await fetch('/.netlify/functions/api?action=skipOccurrence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id: taskId })
    })
    if (res.ok) {
      const data = await res.json()
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, dueDate: new Date(data.due_date), completed: false } : t))
      fetchTaskActivity(taskId).catch(console.error)
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
  const handleGenerateInvite = async () => {
    setIsGeneratingInvite(true)
    try {
      const fbToken = await auth.currentUser?.getIdToken() || 'local-debug-token'
      const res = await fetch('/.netlify/functions/api?action=generateInvite', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${fbToken}`
        },
        body: JSON.stringify({ role: 'user' })
      })
      if (res.ok) {
        const data = await res.json()
        const link = `${window.location.origin}/invite/${data.token}`
        await navigator.clipboard.writeText(link)
        alert('Workspace Invite Link copied to clipboard!')
      } else {
        const errText = await res.text().catch(() => '');
        alert(`Failed to generate invite. Server responded with ${res.status}: ${errText}`);
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsGeneratingInvite(false)
    }
  }

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
    try {
      const token = await auth.currentUser?.getIdToken() || 'local-debug-token'
      const res = await fetch('/.netlify/functions/api?action=testTelegram', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        let msg = "Test Notification Results:\n"
        msg += data.telegram ? "✅ Telegram: SENT\n" : "❌ Telegram: NOT CONNECTED\n"
        msg += data.browser ? "✅ Browser: SENT\n" : "❌ Browser: NO SUBSCRIPTION\n"
        alert(msg)
      }
    } catch (err) {
      console.error(err)
      alert("Test failed. Check console.")
    }
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

  const filteredTasks = tasks
    .filter(task => {
      const query = searchQuery.trim().toLowerCase()
      const matchesSearch = !query || task.title.toLowerCase().includes(query) || (task.description_html || '').toLowerCase().includes(query)
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'completed' ? task.completed : !task.completed)
      const matchesType = typeFilter === 'all' || task.type === typeFilter
      const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter
      return matchesSearch && matchesStatus && matchesType && matchesPriority
    })
    .sort((a, b) => {
      if (sortMode === 'newest') return b.dueDate.getTime() - a.dueDate.getTime()
      return a.dueDate.getTime() - b.dueDate.getTime()
    })

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-white/95 backdrop-blur shadow-sm border-b sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex flex-wrap justify-between items-center gap-2 py-2 sm:py-0 sm:h-16">
             <div className="flex items-center space-x-1 sm:space-x-2 min-w-0">
              <Bell className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600" />
              <div className="flex flex-col sm:flex-row sm:items-baseline sm:space-x-2 min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">RelaySignal</h1>
                {isAdmin && (
                  <span className="text-[10px] sm:text-xs font-black bg-blue-600 text-white px-1.5 py-0.5 rounded tracking-widest uppercase">
                    Admin
                  </span>
                )}
              </div>
            </div>
            
            <div className="flex items-center flex-wrap justify-end gap-2 sm:gap-4">
              {isAdmin && (
                <>
                  <div className="hidden md:flex items-center space-x-1.5 px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-gray-600 text-sm font-semibold">
                    <Users className="h-4 w-4 text-blue-500" />
                    <span>{users.length} Followers</span>
                  </div>

                  <button
                    onClick={handleGenerateInvite}
                    disabled={isGeneratingInvite}
                    className="flex items-center space-x-2 px-2.5 sm:px-3 py-2 rounded-lg bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 transition text-xs sm:text-sm disabled:opacity-50"
                    title="Copy Invite Link"
                  >
                    <Link className="h-4 w-4" />
                    <span>{isGeneratingInvite ? 'Generating...' : 'Generate Invite Link'}</span>
                  </button>
                  
                  <button
                    onClick={() => setShowAdminPanel(!showAdminPanel)}
                    className="flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-lg bg-blue-600 text-white shadow-sm hover:bg-blue-700 transition text-xs sm:text-sm"
                  >
                    <Settings className="h-4 w-4" />
                    <span className="hidden sm:inline">{showAdminPanel ? 'User View' : 'Admin Panel'}</span>
                    <span className="sm:hidden">{showAdminPanel ? 'User' : 'Admin'}</span>
                  </button>
                </>
              )}
              
              <div className="relative">
                <div
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center space-x-2 cursor-pointer p-2 rounded-md hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-200"
                >
                  <User className="h-6 w-6 text-gray-600" />
                  <span className="text-sm font-medium text-gray-700 hidden sm:inline">{currentUser.name}</span>
                </div>
                
                {isUserMenuOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setIsUserMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 w-64 bg-white shadow-xl rounded-lg border border-gray-100 z-20 overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 duration-200">
                      {!telegramStatus.connected ? (
                          <div className="border-b border-gray-50">
                            <button 
                              disabled={telegramStatus.polling}
                              onClick={async () => {
                                setIsUserMenuOpen(false)
                                setTelegramStatus(s => ({ ...s, polling: true, attempts: 0 }))
                                const token = await auth.currentUser?.getIdToken() || 'local-debug-token'
                                fetch('/.netlify/functions/api?action=registerWebhook', {
                                    method: 'POST',
                                    headers: { 'Authorization': `Bearer ${token}` }
                                }).catch(() => {});
                                window.location.href = `tg://resolve?domain=RelaySignals_bot&start=${currentUser.id}`;
                              }} 
                              className={`w-full text-left px-4 py-3 text-sm flex items-center transition-colors ${telegramStatus.polling ? 'text-gray-400 bg-gray-50' : 'text-blue-600 hover:bg-blue-50'}`}
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
                        <div className="border-b border-gray-50">
                            <div className="px-4 py-3 text-sm text-green-600 font-medium flex items-center bg-green-50/50">
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Telegram Linked
                            </div>
                            <button 
                              onClick={() => { setIsUserMenuOpen(false); handleTestTelegram(); }}
                              className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center transition-colors"
                            >
                              <Bell className="h-4 w-4 mr-2 text-blue-500"/> 
                              Send Test Notification
                            </button>
                            <button 
                              onClick={() => { setIsUserMenuOpen(false); handleDisconnectTelegram(); }}
                              className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 flex items-center transition-colors"
                            >
                              <Trash2 className="h-4 w-4 mr-2"/> 
                              Disconnect Telegram
                            </button>
                        </div>
                      )}

                      <button onClick={() => { setIsUserMenuOpen(false); handleUnlinkAdmin(); }} className="w-full text-left px-4 py-3 text-sm text-yellow-600 hover:bg-yellow-50 flex items-center transition-colors">
                          <LogOut className="h-4 w-4 mr-2"/> Unlink Workspace
                      </button>
                      <button onClick={() => { setIsUserMenuOpen(false); handleDeleteAccount(); }} className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 flex items-center transition-colors">
                          <Trash2 className="h-4 w-4 mr-2"/> Delete Account
                      </button>
                      <button onClick={() => { setIsUserMenuOpen(false); handleLogout(); }} className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center transition-colors">
                          <LogOut className="h-4 w-4 mr-2"/> Sign Out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Mobile Tab Switcher */}
        {!showAdminPanel && (
          <div className="lg:hidden border-t border-gray-100 flex items-center bg-white px-2 pt-1">
            <button 
              onClick={() => setActiveTab('tasks')}
              className={`flex-1 py-3 text-sm font-semibold transition-all border-b-2 ${activeTab === 'tasks' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}
            >
              Tasks
            </button>
            <button 
              onClick={() => setActiveTab('notifications')}
              className={`flex-1 py-3 text-sm font-semibold transition-all border-b-2 ${activeTab === 'notifications' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}
            >
              Notifications
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 w-full">
        {showAdminPanel ? (
          <AdminPanel 
            isAdmin={isAdmin}
            onToggleAdmin={() => setIsAdmin(!isAdmin)}
            onSendNotification={(n: any) => setNotifications([n, ...notifications])} // Stubbed for now
            users={users}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8 items-start">
            <div className={`bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-6 ${activeTab !== 'tasks' ? 'hidden lg:block' : ''}`}>
              
              {isAdmin && users.length === 0 && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 sm:p-5 mb-6 sm:mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start sm:items-center">
                    <div className="bg-blue-100 p-3 rounded-full mr-4">
                      <Link className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="text-blue-900 font-bold text-sm sm:text-base">Grow your audience!</h4>
                      <p className="text-blue-700 text-sm">You haven't linked any users yet. Share your link to start sending global alerts.</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleGenerateInvite}
                    className="w-full sm:w-auto whitespace-nowrap px-6 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition shadow-sm"
                  >
                     Generate Invite Link
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-800 flex items-center">
                    <Calendar className="h-5 w-5 mr-2 text-blue-500" />
                    {isAdmin && showAdminPanel ? 'Admin Dashboard' : 'Your Tasks'}
                  </h2>
                  {isAdmin && showAdminPanel && (
                    <p className="text-xs text-gray-500 mt-1 font-medium">Manage notifications and followers</p>
                  )}
                </div>
                <span className="text-sm px-3 py-1 bg-blue-50 text-blue-600 rounded-full font-medium">
                  {filteredTasks.filter(t => !t.completed).length} pending
                </span>
              </div>

              <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search tasks..." className="px-3 py-2 border border-gray-300 rounded-md" />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="px-3 py-2 border border-gray-300 rounded-md">
                  <option value="all">All status</option>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                </select>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className="px-3 py-2 border border-gray-300 rounded-md">
                  <option value="all">All types</option>
                  <option value="standard">Standard</option>
                  <option value="poll">Poll</option>
                </select>
                <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as any)} className="px-3 py-2 border border-gray-300 rounded-md">
                  <option value="all">All priorities</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
                <select value={sortMode} onChange={(e) => setSortMode(e.target.value as any)} className="px-3 py-2 border border-gray-300 rounded-md">
                  <option value="dueSoonest">Due soonest</option>
                  <option value="newest">Newest</option>
                </select>
              </div>

              <div className="mb-6 sm:mb-8">
                  <TaskEditor 
                    onSave={handleCreateTaskObj} 
                    isAdmin={isAdmin} 
                    initialTask={editingTask}
                    onCancel={() => setEditingTask(null)}
                  />
              </div>

              <div className="space-y-8">
                {Object.entries(
                   filteredTasks.reduce((acc, t) => {
                       const g = t.groupName || 'Ungrouped Tasks';
                       if (!acc[g]) acc[g] = [];
                       acc[g].push(t);
                       return acc;
                   }, {} as Record<string, Task[]>)
                ).map(([groupString, groupTasks]) => (
                  <div key={groupString} className="space-y-3 sm:space-y-4">
                     <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider pl-2 border-l-4 border-blue-400">{groupString}</h3>
                     
                     {groupTasks.map((task) => (
                      <div
                        key={task.id}
                        className={`p-3 sm:p-4 border rounded-xl shadow-sm transition-all ${
                          task.completed ? 'bg-green-50/50 border-green-200 opacity-75' : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-md'
                        }`}
                      >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-start sm:items-center space-x-2 sm:space-x-3">
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
                           <h3 className={`text-base sm:text-lg font-medium ${task.completed ? 'text-green-800 line-through' : 'text-gray-900'}`}>
                             {task.title}
                             {task.priority && task.priority !== 'medium' && (
                               <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-bold ${
                                 task.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                                 task.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                                 'bg-blue-100 text-blue-700'
                               }`}>
                                 {task.priority.toUpperCase()}
                               </span>
                             )}
                             {task.userId !== currentUser.id && (
                                 <span className="ml-2 text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">From Admin</span>
                             )}
                           </h3>
                        </div>
                        {task.description_html && (
                          <div 
                             className="text-sm text-gray-600 mt-3 ml-2 sm:ml-11 prose prose-sm max-w-none"
                             dangerouslySetInnerHTML={{__html: task.description_html}}
                          />
                        )}
                        {task.attachments && task.attachments.length > 0 && (
                          <div className="ml-2 sm:ml-11 mt-3 space-y-1">
                            <p className="text-xs font-semibold text-gray-500 uppercase">Attachments</p>
                            {task.attachments.map((attachment, i) => (
                              <a key={`${attachment.url}-${i}`} href={attachment.url} target="_blank" rel="noreferrer" className="block text-sm text-blue-600 hover:underline truncate">
                                {attachment.name}
                              </a>
                            ))}
                          </div>
                        )}
                        {task.recurrence && (
                          <div className="ml-2 sm:ml-11 mt-2 text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 inline-block px-2 py-1 rounded">
                            Recurs {task.recurrence.frequency} every {task.recurrence.interval}
                          </div>
                        )}
                        
                        {task.type === 'poll' && (
                           <div className="mt-4 ml-2 sm:ml-11 bg-gray-50 border p-3 rounded-lg max-w-sm">
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
                        
                        <div className="ml-2 sm:ml-11 flex items-center space-x-2 mt-4 flex-wrap gap-y-2">
                            {['👍', '❤️', '👀', '🔥', '😢'].map(emoji => {
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
                        
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-5 ml-2 sm:ml-11 border-t pt-4 border-gray-100">
                          <p className="text-xs text-gray-500 font-medium bg-gray-100/80 inline-block px-2.5 py-1.5 rounded-md flex items-center">
                            Due: {format(task.dueDate, 'MMM dd, yyyy HH:mm')}
                          </p>
                          <div className="flex items-center flex-wrap gap-1">
                            <button
                              onClick={() => handleSnoozeTask(task.id)}
                              className="text-gray-400 hover:text-orange-500 transition-colors p-1.5 rounded-md hover:bg-orange-50"
                              title="Snooze 30 minutes"
                            >
                              ⏰
                            </button>
                            {task.recurrence && (
                              <button
                                onClick={() => handleSkipOccurrence(task.id)}
                                className="text-gray-400 hover:text-purple-500 transition-colors p-1.5 rounded-md hover:bg-purple-50"
                                title="Skip this occurrence"
                              >
                                ⏭️
                              </button>
                            )}
                            <button 
                                onClick={() => handleToggleMute(task.id)}
                                className="text-gray-400 hover:text-yellow-500 transition-colors p-1.5 rounded-md hover:bg-yellow-50"
                                title={mutedTasks.includes(task.id) ? "Unmute Notifications" : "Mute Notifications"}
                            >
                                {mutedTasks.includes(task.id) ? "🔕" : "🔔"}
                            </button>
                            
                            {isAdmin && (task.userId === currentUser.id) && (
                               <button
                                 onClick={() => handleGenerateInvite()}
                                 className="text-gray-400 hover:text-indigo-600 transition-colors p-1.5 rounded-md hover:bg-indigo-50"
                                 title="Copy Invite Link to share"
                               >
                                 <Link className="h-5 w-5" />
                               </button>
                            )}

                            {(task.userId === currentUser.id || isAdmin) && (
                               <button
                                 onClick={() => handleEditTask(task)}
                                 className="text-gray-400 hover:text-blue-500 transition-colors p-1.5 rounded-md hover:bg-blue-50"
                                 title="Edit task"
                               >
                                 <Pencil className="h-5 w-5" />
                               </button>
                            )}
                            {(task.userId === currentUser.id || isAdmin) && (
                               <button
                                 onClick={() => handleDeleteTask(task.id)}
                                 className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-md hover:bg-red-50"
                                 title="Delete task"
                               >
                                 <Trash2 className="h-5 w-5" />
                               </button>
                            )}
                            <button
                              onClick={() => fetchTaskActivity(task.id)}
                              className="text-gray-400 hover:text-slate-600 transition-colors p-1.5 rounded-md hover:bg-slate-50"
                              title="Load activity timeline"
                            >
                              🕒
                            </button>
                          </div>
                        </div>
                        {activityByTask[task.id]?.length ? (
                          <div className="ml-2 sm:ml-11 mt-3 border-t pt-3">
                            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Activity timeline</p>
                            <div className="space-y-1">
                              {activityByTask[task.id].slice(0, 5).map((item) => (
                                <div key={item.id} className="text-xs text-gray-600">
                                  {item.detail} - {format(new Date(item.created_at), 'MMM dd, HH:mm')}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
                </div>
                ))}
                
                {filteredTasks.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    <Calendar className="h-16 w-16 mx-auto mb-4 opacity-30 text-blue-500" />
                    <p className="text-lg">No tasks yet. Add your first task above!</p>
                  </div>
                )}
              </div>
            </div>

            <div className={`bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-6 ${activeTab !== 'notifications' ? 'hidden lg:block' : ''}`}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-800 flex items-center">
                  <Bell className="h-5 w-5 mr-2 text-yellow-500" />
                  Notifications
                </h2>
                <span className="text-sm px-3 py-1 bg-yellow-50 text-yellow-700 rounded-full font-medium">
                   {notifications.filter(n => !n.isRead).length} unread
                </span>
              </div>
              <div className="flex items-center gap-2 mb-4">
                <select value={notificationFilter} onChange={(e) => setNotificationFilter(e.target.value as any)} className="px-3 py-2 border border-gray-300 rounded-md text-sm">
                  <option value="all">All types</option>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="urgent">Urgent</option>
                </select>
                <button onClick={() => fetchNotifications()} className="px-3 py-2 text-sm bg-gray-100 rounded-md hover:bg-gray-200">Refresh</button>
                <button onClick={handleClearNotifications} className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">Mark all read</button>
              </div>

              <div className="space-y-4">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 border rounded-xl shadow-sm transition-all ${
                      notification.type === 'urgent' ? 'bg-red-50 border-red-200' :
                      notification.type === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                      'bg-blue-50 border-blue-200'
                    } ${notification.isRead ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{notification.title}</h3>
                        <p className="text-sm text-gray-700 mt-1.5 leading-relaxed">{notification.message}</p>
                        <p className="text-xs text-gray-500 mt-3 font-medium">
                          {format(notification.timestamp, 'MMM dd, yyyy HH:mm')}
                        </p>
                      </div>
                      <button onClick={() => handleMarkNotificationRead(notification.id, !notification.isRead)} className="text-xs px-2 py-1 rounded bg-white border border-gray-200 hover:bg-gray-50">
                        {notification.isRead ? 'Mark unread' : 'Mark read'}
                      </button>
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