import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './lib/auth'
import { useProfile } from './lib/api'
import { Loading } from './components/ui'
import SignIn from './pages/SignIn'
import Home from './pages/Home'
import GroupPage from './pages/GroupPage'
import ExpenseForm from './pages/ExpenseForm'
import SettleUp from './pages/SettleUp'
import GroupSettings from './pages/GroupSettings'
import Join from './pages/Join'
import Account from './pages/Account'
import ChooseName from './pages/ChooseName'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: true },
  },
})

function Routed() {
  const { session, loading } = useAuth()
  if (loading) return <Loading />
  // Signed-out users see sign-in on any URL, then land back on it (e.g. an invite link).
  if (!session) return <SignIn />
  return <SignedIn userId={session.user.id} />
}

function SignedIn({ userId }: { userId: string }) {
  const profile = useProfile(userId)
  if (profile.isPending) return <Loading />
  // New email users pick a name once (an error here falls through to the app).
  if (profile.data && !profile.data.name_confirmed) return <ChooseName profile={profile.data} />
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/account" element={<Account />} />
      <Route path="/join/:code" element={<Join />} />
      <Route path="/g/:groupId" element={<GroupPage />} />
      <Route path="/g/:groupId/settings" element={<GroupSettings />} />
      <Route path="/g/:groupId/settle" element={<SettleUp />} />
      <Route path="/g/:groupId/expense/new" element={<ExpenseForm />} />
      <Route path="/g/:groupId/expense/:expenseId" element={<ExpenseForm />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routed />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
