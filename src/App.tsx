import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { AuthProvider } from './context/AuthContext'
import { LoginPage } from './features/auth/LoginPage'
import { RegisterPage } from './features/auth/RegisterPage'
import { ManageStudentsPage } from './features/class/ManageStudentsPage'
import { ProtectedRoute } from './features/auth/ProtectedRoute'
import { HomePage } from './features/calendar/HomePage'
import { LiveSessionPage } from './features/live/LiveSessionPage'
import { SessionPage } from './features/sessions/SessionPage'
import { ClassStatsPage } from './features/statistics/ClassStatsPage'
import { StudentStatsPage } from './features/statistics/StudentStatsPage'
import { SessionsProvider } from './features/sessions/SessionsProvider'
import { StudentHomePage } from './features/student/StudentHomePage'
import { EditTasksPage } from './features/tasks/EditTasksPage'
import { AllTopicsPage } from './features/topics/AllTopicsPage'
import { TopicPage } from './features/topics/TopicPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/registrer" element={<RegisterPage />} />

          <Route
            element={
              <ProtectedRoute role="teacher">
                <SessionsProvider>
                  <AppLayout />
                </SessionsProvider>
              </ProtectedRoute>
            }
          >
            <Route index element={<HomePage />} />
            <Route path="okt/:sessionId" element={<SessionPage />} />
            <Route path="tema" element={<AllTopicsPage />} />
            <Route path="tema/:topicId" element={<TopicPage />} />
            <Route path="okt/:sessionId/rediger" element={<EditTasksPage />} />
            <Route path="okt/:sessionId/live" element={<LiveSessionPage />} />
            <Route path="elever" element={<ManageStudentsPage />} />
            <Route path="statistikk" element={<ClassStatsPage />} />
            <Route path="statistikk/elev/:studentId" element={<StudentStatsPage />} />
          </Route>

          <Route
            path="/elev/*"
            element={
              <ProtectedRoute role="student">
                <SessionsProvider>
                  <StudentHomePage />
                </SessionsProvider>
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
