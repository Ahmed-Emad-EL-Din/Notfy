import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../App';

// Mock Firebase
vi.mock('../lib/firebase', () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue('mock-token'),
      uid: 'user123',
      email: 'test@example.com',
      displayName: 'Test User'
    }
  }
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((auth, cb) => {
    // trigger auth state asynchronously
    setTimeout(() => {
        cb({ uid: 'user123', email: 'test@example.com', displayName: 'Test User' });
    }, 10);
    return vi.fn(); // unsubscribe mock
  })
}));

// Mock Push Subscription
vi.mock('../lib/pushSubscription', () => ({
  subscribeUserToPush: vi.fn()
}));

const mockTasks = [
  {
    _id: 'task1',
    title: 'Hello Grouped Task',
    description_html: '<p>test</p>',
    due_date: new Date(Date.now() + 100000).toISOString(),
    completed: false,
    user_id: 'user123',
    visibility: 'personal',
    groupName: 'Development',
    type: 'standard',
    reactions: { '👍': ['user123'] }
  },
  {
    _id: 'task2',
    title: 'Hello Poll Task',
    description_html: '<p>poll test</p>',
    due_date: new Date(Date.now() + 100000).toISOString(),
    completed: false,
    user_id: 'user123',
    visibility: 'global',
    groupName: 'Announcements',
    type: 'poll',
    pollOptions: ['Yes', 'No'],
    showPollResults: true,
    votes: { 0: [{uid: 'user123', anonymous: false}] }
  }
];

describe('App Component', () => {
  beforeEach(() => {
    // mock window methods
    window.confirm = vi.fn().mockReturnValue(true);
    
    // mock fetches
    global.fetch = vi.fn((url: string) => {
      if (url.includes('action=upsertUser')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: 'user123',
            email: 'test@example.com',
            name: 'Test User',
            is_admin: false,
            muted_tasks: ['task2']
          })
        });
      }
      if (url.includes('action=getTasks')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTasks)
        });
      }
      if (url.includes('action=checkTelegramStatus')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ connected: false })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as any;
  });

  it('renders tasks appropriately under groups', async () => {
    render(<App />);

    // Wait for the tasks to be fetched and rendered
    await waitFor(() => {
      expect(screen.getByText(/DEVELOPMENT/i)).toBeInTheDocument();
      expect(screen.getByText(/ANNOUNCEMENTS/i)).toBeInTheDocument();
    });

    expect(screen.getByText('Hello Grouped Task')).toBeInTheDocument();
    expect(screen.getByText('Hello Poll Task')).toBeInTheDocument();
  });

  it('renders correctly mapped poll options', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Hello Poll Task')).toBeInTheDocument();
    });

    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
    expect(screen.getByText(/1 votes \(100%\)/)).toBeInTheDocument();
  });

  it('shows muted status for muted tasks', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Hello Poll Task')).toBeInTheDocument();
    });
    
    // Our fetch mock mocked muted_tasks: ['task2'] (Hello Poll Task)
    // The button title should be "Unmute Notifications" for task2, and "Mute Notifications" for task1.
    expect(screen.getByTitle('Unmute Notifications')).toBeInTheDocument();
    expect(screen.getByTitle('Mute Notifications')).toBeInTheDocument();
  });
});
