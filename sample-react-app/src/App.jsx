import { useState, useEffect } from 'react'
import './App.css'

// API URL - can be configured via environment variable
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function App() {
  const [health, setHealth] = useState(null)
  const [users, setUsers] = useState([])
  const [counter, setCounter] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [newUser, setNewUser] = useState({ name: '', email: '' })

  // Fetch health status
  const fetchHealth = async () => {
    try {
      const response = await fetch(`${API_URL}/health`)
      const data = await response.json()
      setHealth(data)
      setError(null)
    } catch (err) {
      setError('Failed to connect to API')
      setHealth(null)
    }
  }

  // Fetch users
  const fetchUsers = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${API_URL}/users`)
      const data = await response.json()
      setUsers(data.data || [])
    } catch (err) {
      setError('Failed to fetch users')
    } finally {
      setLoading(false)
    }
  }

  // Fetch counter
  const fetchCounter = async () => {
    try {
      const response = await fetch(`${API_URL}/counter`)
      const data = await response.json()
      setCounter(data.counter || 0)
    } catch (err) {
      console.log('Counter not available')
    }
  }

  // Increment counter
  const incrementCounter = async () => {
    try {
      const response = await fetch(`${API_URL}/counter/increment`, {
        method: 'POST'
      })
      const data = await response.json()
      setCounter(data.counter || counter + 1)
    } catch (err) {
      setError('Failed to increment counter')
    }
  }

  // Add new user
  const addUser = async (e) => {
    e.preventDefault()
    if (!newUser.name || !newUser.email) return

    try {
      const response = await fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newUser)
      })
      const data = await response.json()
      if (data.success) {
        setUsers([...users, data.data])
        setNewUser({ name: '', email: '' })
      }
    } catch (err) {
      setError('Failed to add user')
    }
  }

  // Initial fetch
  useEffect(() => {
    fetchHealth()
    fetchUsers()
    fetchCounter()
  }, [])

  return (
    <div className="app">
      <header className="header">
        <h1>DevOps Learning Dashboard - Pro</h1>
        <p className="subtitle">Sample React Application</p>
      </header>

      <main className="main">
        {/* API Connection Status */}
        <section className="card">
          <h2>API Connection Status</h2>
          <div className="status-box">
            {health ? (
              <div className="status-connected">
                <span className="status-dot green"></span>
                <div>
                  <strong>Connected</strong>
                  <p>API: {API_URL}</p>
                  <p>Redis: {health.redis}</p>
                  <p>Uptime: {Math.round(health.uptime)}s</p>
                </div>
              </div>
            ) : (
              <div className="status-disconnected">
                <span className="status-dot red"></span>
                <div>
                  <strong>Disconnected</strong>
                  <p>Cannot connect to API at {API_URL}</p>
                  {error && <p className="error">{error}</p>}
                </div>
              </div>
            )}
          </div>
          <button onClick={fetchHealth} className="btn">
            Refresh Status
          </button>
        </section>

        {/* Counter Section */}
        <section className="card">
          <h2>Redis Counter</h2>
          <div className="counter-display">
            <span className="counter-value">{counter}</span>
          </div>
          <button onClick={incrementCounter} className="btn btn-primary">
            Increment Counter
          </button>
          <p className="hint">Counter value is stored in Redis (if connected)</p>
        </section>

        {/* Users Section */}
        <section className="card">
          <h2>Users ({users.length})</h2>

          {/* Add User Form */}
          <form onSubmit={addUser} className="form">
            <input
              type="text"
              placeholder="Name"
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              className="input"
            />
            <input
              type="email"
              placeholder="Email"
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              className="input"
            />
            <button type="submit" className="btn btn-success">
              Add User
            </button>
          </form>

          {/* Users List */}
          <div className="users-list">
            {loading ? (
              <p>Loading...</p>
            ) : users.length > 0 ? (
              users.map((user) => (
                <div key={user.id} className="user-item">
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                </div>
              ))
            ) : (
              <p>No users found</p>
            )}
          </div>
          <button onClick={fetchUsers} className="btn">
            Refresh Users
          </button>
        </section>

        {/* Task Info */}
        <section className="card task-card">
          <h2>Your Task</h2>
          <div className="task-content">
            <p><strong>Create a Dockerfile for this React application!</strong></p>
            <ul>
              <li>Use multi-stage build for optimization</li>
              <li>Stage 1: Build the app with Node.js</li>
              <li>Stage 2: Serve with Nginx</li>
              <li>Final image should be minimal</li>
            </ul>
            <p className="hint">
              Hint: Build output goes to <code>/dist</code> folder
            </p>
          </div>
        </section>
      </main>

      <footer className="footer">
        <p>DevOps Learning Session - February 2025</p>
        <p>
          <small>API URL: {API_URL}</small>
        </p>
      </footer>
    </div>
  )
}

export default App
