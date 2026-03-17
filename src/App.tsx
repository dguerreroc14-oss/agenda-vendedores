import { useState, useEffect } from 'react'
import './App.css'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { CalendarPlus, Trash2, CheckCircle, XCircle, Phone, MapPin, FileText, LogOut, User, Clock, Calendar, Users, Shield } from 'lucide-react'

function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(path, {
    ...options,
    credentials: 'same-origin',
  })
}

interface Visita {
  id: number
  vendedor: string
  cliente: string
  telefono: string
  fecha: string
  hora: string
  direccion: string
  notas: string
  vendida: boolean
  created_at: string
}

interface UserInfo {
  id: number
  username: string
  role: string
  created_at: string
}

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('auth_token'))
  const [username, setUsername] = useState<string>(localStorage.getItem('auth_user') || '')
  const [role, setRole] = useState<string>(localStorage.getItem('auth_role') || '')
  const [loginUser, setLoginUser] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  const [visitas, setVisitas] = useState<Visita[]>([])
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formData, setFormData] = useState({
    vendedor: '',
    cliente: '',
    telefono: '',
    fecha: '',
    hora: '',
    direccion: '',
    notas: '',
  })

  const [showUsers, setShowUsers] = useState(false)
  const [users, setUsers] = useState<UserInfo[]>([])
  const [userDialogOpen, setUserDialogOpen] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', password: '' })
  const [userError, setUserError] = useState('')

  const isAdmin = role === 'admin'

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginLoading(true)
    setLoginError('')
    try {
      const res = await apiFetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUser, password: loginPass }),
      })
      if (!res.ok) {
        const err = await res.json()
        setLoginError(err.detail || 'Error al iniciar sesion')
        return
      }
      const data = await res.json()
      localStorage.setItem('auth_token', data.token)
      localStorage.setItem('auth_user', data.username)
      localStorage.setItem('auth_role', data.role)
      setToken(data.token)
      setUsername(data.username)
      setRole(data.role)
    } catch {
      setLoginError('Error de conexion')
    } finally {
      setLoginLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    localStorage.removeItem('auth_role')
    setToken(null)
    setUsername('')
    setRole('')
    setVisitas([])
    setUsers([])
    setShowUsers(false)
  }

  const fetchVisitas = async () => {
    try {
      const res = await apiFetch('/api/visitas', {
        headers: { 'X-Auth-Token': token || '' },
      })
      if (res.status === 401) {
        handleLogout()
        return
      }
      const data = await res.json()
      setVisitas(data)
    } catch (err) {
      console.error('Error al cargar visitas:', err)
    }
  }

  const fetchUsers = async () => {
    try {
      const res = await apiFetch('/api/users', {
        headers: { 'X-Auth-Token': token || '' },
      })
      if (res.ok) {
        const data = await res.json()
        setUsers(data)
      }
    } catch (err) {
      console.error('Error al cargar usuarios:', err)
    }
  }

  useEffect(() => {
    if (token) {
      fetchVisitas()
      if (isAdmin) {
        fetchUsers()
      }
    }
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await apiFetch('/api/visitas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token || '' },
        body: JSON.stringify(formData),
      })
      setFormData({ vendedor: '', cliente: '', telefono: '', fecha: '', hora: '', direccion: '', notas: '' })
      setDialogOpen(false)
      await fetchVisitas()
    } catch (err) {
      console.error('Error al crear visita:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleVendida = async (id: number) => {
    try {
      await apiFetch('/api/visitas/' + id + '/vendida', {
        method: 'PATCH',
        headers: { 'X-Auth-Token': token || '' },
      })
      await fetchVisitas()
    } catch (err) {
      console.error('Error al actualizar:', err)
    }
  }

  const eliminarVisita = async (id: number) => {
    if (!confirm('Estas seguro de eliminar esta visita?')) return
    try {
      await apiFetch('/api/visitas/' + id, {
        method: 'DELETE',
        headers: { 'X-Auth-Token': token || '' },
      })
      await fetchVisitas()
    } catch (err) {
      console.error('Error al eliminar:', err)
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setUserError('')
    try {
      const res = await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token || '' },
        body: JSON.stringify(newUser),
      })
      if (!res.ok) {
        const err = await res.json()
        setUserError(err.detail || 'Error al crear usuario')
        return
      }
      setNewUser({ username: '', password: '' })
      setUserDialogOpen(false)
      await fetchUsers()
    } catch {
      setUserError('Error de conexion')
    }
  }

  const deleteUser = async (userId: number) => {
    if (!confirm('Estas seguro de eliminar este usuario?')) return
    try {
      await apiFetch('/api/users/' + userId, {
        method: 'DELETE',
        headers: { 'X-Auth-Token': token || '' },
      })
      await fetchUsers()
    } catch (err) {
      console.error('Error al eliminar usuario:', err)
    }
  }

  const formatFecha = (fecha: string) => {
    const parts = fecha.split('-')
    if (parts.length === 3) {
      return parts[2] + '/' + parts[1] + '/' + parts[0]
    }
    return fecha
  }

  const visitasPendientes = visitas.filter((v) => !v.vendida)
  const visitasVendidas = visitas.filter((v) => v.vendida)

  if (!token) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
              <User className="w-6 h-6 text-emerald-600" />
            </div>
            <CardTitle className="text-xl">Agenda de Visitas</CardTitle>
            <p className="text-sm text-zinc-500">Inicia sesion para continuar</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-user">Usuario</Label>
                <Input
                  id="login-user"
                  placeholder="Nombre de usuario"
                  value={loginUser}
                  onChange={(e) => setLoginUser(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-pass">Contrasena</Label>
                <Input
                  id="login-pass"
                  type="password"
                  placeholder="Contrasena"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  required
                />
              </div>
              {loginError && (
                <p className="text-sm text-red-600 text-center">{loginError}</p>
              )}
              <Button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                disabled={loginLoading}
              >
                {loginLoading ? 'Ingresando...' : 'Iniciar Sesion'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-zinc-900 text-white py-3 px-4 md:py-4 md:px-6 shadow-lg">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3">
            <CalendarPlus className="w-6 h-6 md:w-8 md:h-8 text-emerald-400" />
            <div>
              <h1 className="text-base md:text-xl font-bold">Agenda de Visitas</h1>
              <p className="text-zinc-400 text-xs md:text-sm hidden sm:block">Control de visitas para vendedores</p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <span className="text-xs md:text-sm text-zinc-400 flex items-center gap-1">
              {isAdmin ? <Shield className="w-3 h-3 md:w-4 md:h-4 text-amber-400" /> : <User className="w-3 h-3 md:w-4 md:h-4" />}
              <span className="hidden sm:inline">{username}</span>
              {isAdmin && <Badge className="bg-amber-600 text-white text-xs ml-1 hidden sm:inline-flex">Admin</Badge>}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800 text-xs md:text-sm"
            >
              <LogOut className="w-3 h-3 md:w-4 md:h-4 mr-1" />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 md:px-6 pt-4 md:pt-6">
        <div className="flex items-center justify-between gap-2">
          {isAdmin && (
            <div className="flex gap-2">
              <Button
                variant={showUsers ? 'outline' : 'default'}
                size="sm"
                onClick={() => setShowUsers(false)}
                className={!showUsers ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
              >
                <CalendarPlus className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">Visitas</span>
              </Button>
              <Button
                variant={showUsers ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setShowUsers(true); fetchUsers() }}
                className={showUsers ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
              >
                <Users className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">Usuarios</span>
              </Button>
            </div>
          )}
          {!showUsers && (
            <div className="ml-auto">
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm md:text-base">
                    <CalendarPlus className="w-4 h-4 mr-1 md:mr-2" />
                    Nueva Visita
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm sm:max-w-lg mx-auto">
                  <DialogHeader>
                    <DialogTitle className="text-lg md:text-xl">Agendar Nueva Visita</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4 mt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                      <div className="space-y-1 md:space-y-2">
                        <Label htmlFor="vendedor">Vendedor *</Label>
                        <Input id="vendedor" placeholder="Nombre del vendedor" value={formData.vendedor} onChange={(e) => setFormData({ ...formData, vendedor: e.target.value })} required />
                      </div>
                      <div className="space-y-1 md:space-y-2">
                        <Label htmlFor="cliente">Cliente *</Label>
                        <Input id="cliente" placeholder="Nombre del cliente" value={formData.cliente} onChange={(e) => setFormData({ ...formData, cliente: e.target.value })} required />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                      <div className="space-y-1 md:space-y-2">
                        <Label htmlFor="telefono">Telefono *</Label>
                        <Input id="telefono" placeholder="Numero de contacto" value={formData.telefono} onChange={(e) => setFormData({ ...formData, telefono: e.target.value })} required />
                      </div>
                      <div className="space-y-1 md:space-y-2">
                        <Label htmlFor="fecha">Fecha *</Label>
                        <Input id="fecha" type="date" value={formData.fecha} onChange={(e) => setFormData({ ...formData, fecha: e.target.value })} required />
                      </div>
                      <div className="space-y-1 md:space-y-2">
                        <Label htmlFor="hora">Hora *</Label>
                        <Input id="hora" type="time" value={formData.hora} onChange={(e) => setFormData({ ...formData, hora: e.target.value })} required />
                      </div>
                    </div>
                    <div className="space-y-1 md:space-y-2">
                      <Label htmlFor="direccion">Direccion</Label>
                      <Input id="direccion" placeholder="Direccion de la visita" value={formData.direccion} onChange={(e) => setFormData({ ...formData, direccion: e.target.value })} />
                    </div>
                    <div className="space-y-1 md:space-y-2">
                      <Label htmlFor="notas">Notas</Label>
                      <Input id="notas" placeholder="Notas adicionales" value={formData.notas} onChange={(e) => setFormData({ ...formData, notas: e.target.value })} />
                    </div>
                    <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
                      {loading ? 'Guardando...' : 'Agendar Visita'}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          )}
          {showUsers && isAdmin && (
            <div className="ml-auto">
              <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm md:text-base">
                    <Users className="w-4 h-4 mr-1 md:mr-2" />
                    Nuevo Vendedor
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm mx-auto">
                  <DialogHeader>
                    <DialogTitle className="text-lg md:text-xl">Crear Usuario Vendedor</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateUser} className="space-y-4 mt-2">
                    <div className="space-y-2">
                      <Label htmlFor="new-username">Nombre de usuario</Label>
                      <Input id="new-username" placeholder="Usuario" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-password">Contrasena</Label>
                      <Input id="new-password" type="password" placeholder="Contrasena" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required />
                    </div>
                    {userError && <p className="text-sm text-red-600 text-center">{userError}</p>}
                    <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700">
                      Crear Vendedor
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-6">
        {showUsers && isAdmin ? (
          <Card>
            <CardHeader className="pb-2 md:pb-6">
              <CardTitle className="text-base md:text-lg flex items-center gap-2">
                <Users className="w-5 h-5" />
                Usuarios Registrados
              </CardTitle>
            </CardHeader>
            <CardContent>
              {users.length === 0 ? (
                <div className="text-center py-8 text-zinc-400">
                  <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>No hay usuarios registrados</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {users.map((u) => (
                    <div key={u.id} className="flex items-center justify-between border rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <div className={'w-8 h-8 rounded-full flex items-center justify-center ' + (u.role === 'admin' ? 'bg-amber-100' : 'bg-emerald-100')}>
                          {u.role === 'admin' ? <Shield className="w-4 h-4 text-amber-600" /> : <User className="w-4 h-4 text-emerald-600" />}
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{u.username}</p>
                          <Badge className={u.role === 'admin' ? 'bg-amber-100 text-amber-800 text-xs' : 'bg-emerald-100 text-emerald-800 text-xs'}>
                            {u.role === 'admin' ? 'Administrador' : 'Vendedor'}
                          </Badge>
                        </div>
                      </div>
                      {u.role !== 'admin' && (
                        <Button variant="ghost" size="sm" onClick={() => deleteUser(u.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-6">
              <Card>
                <CardContent className="pt-4 md:pt-6 px-2 md:px-6">
                  <div className="text-center">
                    <p className="text-xl md:text-3xl font-bold text-zinc-900">{visitas.length}</p>
                    <p className="text-xs md:text-sm text-zinc-500">Total</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 md:pt-6 px-2 md:px-6">
                  <div className="text-center">
                    <p className="text-xl md:text-3xl font-bold text-amber-600">{visitasPendientes.length}</p>
                    <p className="text-xs md:text-sm text-zinc-500">Pendientes</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 md:pt-6 px-2 md:px-6">
                  <div className="text-center">
                    <p className="text-xl md:text-3xl font-bold text-emerald-600">{visitasVendidas.length}</p>
                    <p className="text-xs md:text-sm text-zinc-500">Vendidas</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2 md:pb-6">
                <CardTitle className="text-base md:text-lg">Visitas Programadas</CardTitle>
              </CardHeader>
              <CardContent>
                {visitas.length === 0 ? (
                  <div className="text-center py-8 md:py-12 text-zinc-400">
                    <CalendarPlus className="w-10 h-10 md:w-12 md:h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-base md:text-lg">No hay visitas agendadas</p>
                    <p className="text-xs md:text-sm">Haz clic en Nueva Visita para agendar una</p>
                  </div>
                ) : (
                  <>
                    <div className="block md:hidden space-y-3">
                      {visitas.map((visita) => (
                        <div key={visita.id} className={'border rounded-lg p-3 ' + (visita.vendida ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-zinc-200')}>
                          <div className="flex items-center justify-between mb-2">
                            {visita.vendida ? (
                              <Badge className="bg-emerald-100 text-emerald-800 text-xs">Vendida</Badge>
                            ) : (
                              <Badge variant="outline" className="text-amber-700 border-amber-300 text-xs">Pendiente</Badge>
                            )}
                            {isAdmin && (
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="sm" onClick={() => toggleVendida(visita.id)} className="h-8 w-8 p-0">
                                  {visita.vendida ? <XCircle className="w-4 h-4 text-amber-600" /> : <CheckCircle className="w-4 h-4 text-emerald-600" />}
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => eliminarVisita(visita.id)} className="h-8 w-8 p-0">
                                  <Trash2 className="w-4 h-4 text-red-500" />
                                </Button>
                              </div>
                            )}
                          </div>
                          <p className="font-semibold text-sm">{visita.vendedor}</p>
                          <p className="text-sm text-zinc-600">{visita.cliente}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-zinc-500">
                            <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {visita.telefono}</span>
                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatFecha(visita.fecha)}</span>
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {visita.hora}</span>
                          </div>
                          {visita.direccion && <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> {visita.direccion}</p>}
                          {visita.notas && <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1"><FileText className="w-3 h-3" /> {visita.notas}</p>}
                        </div>
                      ))}
                    </div>
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-3 px-2 font-medium text-zinc-500">Estado</th>
                            <th className="text-left py-3 px-2 font-medium text-zinc-500">Vendedor</th>
                            <th className="text-left py-3 px-2 font-medium text-zinc-500">Cliente</th>
                            <th className="text-left py-3 px-2 font-medium text-zinc-500">Contacto</th>
                            <th className="text-left py-3 px-2 font-medium text-zinc-500">Fecha</th>
                            <th className="text-left py-3 px-2 font-medium text-zinc-500">Hora</th>
                            <th className="text-left py-3 px-2 font-medium text-zinc-500">Direccion</th>
                            <th className="text-left py-3 px-2 font-medium text-zinc-500">Notas</th>
                            {isAdmin && <th className="text-left py-3 px-2 font-medium text-zinc-500">Acciones</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {visitas.map((visita) => (
                            <tr key={visita.id} className={'border-b last:border-0 ' + (visita.vendida ? 'bg-emerald-50' : '')}>
                              <td className="py-3 px-2">
                                {visita.vendida ? (
                                  <Badge className="bg-emerald-100 text-emerald-800 text-xs">Vendida</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-amber-700 border-amber-300 text-xs">Pendiente</Badge>
                                )}
                              </td>
                              <td className="py-3 px-2 font-medium">{visita.vendedor}</td>
                              <td className="py-3 px-2">{visita.cliente}</td>
                              <td className="py-3 px-2"><span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {visita.telefono}</span></td>
                              <td className="py-3 px-2">{formatFecha(visita.fecha)}</td>
                              <td className="py-3 px-2">{visita.hora}</td>
                              <td className="py-3 px-2">{visita.direccion && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {visita.direccion}</span>}</td>
                              <td className="py-3 px-2">{visita.notas && <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {visita.notas}</span>}</td>
                              {isAdmin && (
                                <td className="py-3 px-2">
                                  <div className="flex items-center gap-1">
                                    <Button variant="ghost" size="sm" onClick={() => toggleVendida(visita.id)} className="h-8 w-8 p-0">
                                      {visita.vendida ? <XCircle className="w-4 h-4 text-amber-600" /> : <CheckCircle className="w-4 h-4 text-emerald-600" />}
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => eliminarVisita(visita.id)} className="h-8 w-8 p-0">
                                      <Trash2 className="w-4 h-4 text-red-500" />
                                    </Button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

export default App
