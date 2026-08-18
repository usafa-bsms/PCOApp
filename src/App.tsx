import { AuthProvider } from './context/AuthContext'
import { SemesterProvider } from './context/SemesterContext'
import { AppRouter } from './routes'
import './styles/index.css'

export default function App() {
  return (
    <AuthProvider>
      <SemesterProvider>
        <AppRouter />
      </SemesterProvider>
    </AuthProvider>
  )
}