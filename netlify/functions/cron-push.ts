import { schedule } from '@netlify/functions'
import { MongoClient } from 'mongodb'
import webpush from 'web-push'

const uri = process.env.VITE_MONGODB_URI
let cachedClient: MongoClient | null = null

async function connectToDatabase() {
  if (cachedClient) return cachedClient
  if (!uri) throw new Error('VITE_MONGODB_URI is not defined in environment')
  
  const client = new MongoClient(uri)
  await client.connect()
  cachedClient = client
  return client
}

// Config web-push with VAPID keys if they exist in env
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT) {
  let subject = process.env.VAPID_SUBJECT;
  if (!subject.startsWith('mailto:') && !subject.startsWith('http')) {
    subject = `mailto:${subject}`;
  }
  webpush.setVapidDetails(
    subject,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
}

export const handler = schedule("@hourly", async (event) => {
  console.log("Running hourly push notification check...")
  
  if (!process.env.VAPID_PUBLIC_KEY) {
    console.log("No VAPID keys found, skipping push.")
    return { statusCode: 200 }
  }

  try {
    const client = await connectToDatabase()
    const db = client.db('notfy')

    // Find tasks due in the next hour that haven't had a push sent recently
    const now = new Date()
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000)
    const dedupThreshold = new Date(now.getTime() - 55 * 60 * 1000) // 55 minutes ago
    
    const upcomingTasks = await db.collection('tasks').find({
        completed: false,
        due_date: {
            $gte: now.toISOString(),
            $lte: oneHourLater.toISOString()
        },
        $or: [
            { last_push_sent_at: { $exists: false } },
            { last_push_sent_at: { $lt: dedupThreshold.toISOString() } }
        ]
    }).toArray()
    
    if (upcomingTasks.length === 0) {
        return { statusCode: 200 }
    }

    // Load subscriptions
    const subscriptions = await db.collection('push_subscriptions').find().toArray()

    const pushPromises = upcomingTasks.map(async (task) => {
        // Find subscriptions for the user who owns the task or for users linked to the admin (if global task)
        const targetUserIds = [task.user_id]
        if (task.visibility === 'global') {
             const links = await db.collection('user_links').find({ admin_id: task.user_id, active: true, notifications_enabled: true }).toArray()
             links.forEach(l => targetUserIds.push(l.user_id))
        }

        const targetSubs = subscriptions.filter(sub => targetUserIds.includes(sub.user_id))
        
        const payload = JSON.stringify({
            title: 'Task Reminder',
            body: `You have an upcoming task: ${task.title}`
        })

        const webPushPromises = targetSubs.map(sub => {
            const pushSub = {
                endpoint: sub.endpoint,
                keys: sub.keys
            }
            return webpush.sendNotification(pushSub, payload)
              .catch(err => {
                 if (err.statusCode === 410) {
                     // Subscription expired or unsubscribed, remove from DB
                     db.collection('push_subscriptions').deleteOne({ _id: sub._id })
                 }
                 console.error("Push Error", err)
              })
        })

        // Telegram Push Logic
        const telegramPromises = targetUserIds.map(async (uid) => {
             const botToken = process.env.TELEGRAM_BOT_TOKEN;
             if (!botToken) return;

             const user = await db.collection('users').findOne({ id: uid });
             if (user && user.telegram_chat_id) {
                 await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({
                         chat_id: user.telegram_chat_id,
                         text: `🚀 Task Reminder: ${task.title}\nDue: ${new Date(task.due_date).toLocaleString()}`
                     })
                 }).catch(err => console.error("Cron Telegram Error:", err))
             }
        })

        // Mark task as pushed after sending
        await db.collection('tasks').updateOne(
            { _id: task._id },
            { $set: { last_push_sent_at: now.toISOString() } }
        )

        return Promise.all([...webPushPromises, ...telegramPromises])
    });

    await Promise.all(pushPromises)

    return { statusCode: 200 }
  } catch (error) {
    console.error("Cron Error", error)
    return { statusCode: 500 }
  }
})
