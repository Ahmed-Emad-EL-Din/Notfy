

const PUBLIC_VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BAIJQyAq6v3GMBsQhs9i3No5N9l4G-aeMtj4hhP2Gie6wL8U3unjYRv0iCLSESjFRHtCp6NsJgiJ4yEzRS8VzQs'

export async function subscribeUserToPush(userId: string) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push messaging is not supported')
    return
  }

  try {
    // 1. Register Service Worker
    const registration = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    // 2. Request Notification Permission
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      console.warn('Notification permission denied')
      return
    }

    // 3. Subscribe to PushManager
    const existedSubscription = await registration.pushManager.getSubscription()
    if (existedSubscription) {
      await saveSubscriptionToDB(existedSubscription, userId)
      return
    }

    const newSubscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY)
    })

    // 4. Save Subscription to Supabase
    await saveSubscriptionToDB(newSubscription, userId)

  } catch (error) {
    console.error('Error subscribing to push notifications:', error)
  }
}

async function saveSubscriptionToDB(subscription: PushSubscription, userId: string) {
  const subJSON = subscription.toJSON()
  
  if (!subJSON.endpoint || !subJSON.keys) return

  try {
    const res = await fetch('/.netlify/functions/api?action=upsertSubscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        endpoint: subJSON.endpoint,
        p256dh: subJSON.keys.p256dh,
        auth: subJSON.keys.auth
      })
    })

    if (!res.ok) {
      console.error('Error saving push subscription:', await res.text())
    } else {
      console.log('Push subscription saved successfully')
    }
  } catch (error) {
    console.error('Error saving push subscription:', error)
  }
}

// Utility to convert VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
