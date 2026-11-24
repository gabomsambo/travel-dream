"use client"

import { useState } from 'react'
import { KeyRound, Trash2 } from 'lucide-react'
import { Button } from '@/components/adapters/button'
import { Input } from '@/components/adapters/input'
import { Label } from '@/components/adapters/label'
import { CopyField } from '@/components/share/copy-field'
import { notify } from '@/lib/notify'
import type { ShareTokenSummary } from '@/types/share-tokens'

function formatDate(iso: string | null): string {
  if (!iso) return 'Never used'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * Create, name, list and revoke personal share tokens. A new token's value is
 * shown here once, right after it is created; the server keeps only its hash.
 */
export function ShareTokenManager({
  initialTokens,
  defaultName = 'iPhone',
  onCreated,
}: {
  /** Null when the token list could not be loaded (for example, the table is not migrated yet). */
  initialTokens: ShareTokenSummary[] | null
  defaultName?: string
  /** Lets a parent page show the new token in its own instructions too. */
  onCreated?: (secret: string) => void
}) {
  const [tokens, setTokens] = useState<ShareTokenSummary[]>(initialTokens ?? [])
  const [name, setName] = useState(defaultName)
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fresh, setFresh] = useState<{ id: string; secret: string } | null>(null)

  if (initialTokens === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Share tokens are not available right now. Try again later.
      </p>
    )
  }

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (creating) return
    setCreating(true)
    setError(null)
    try {
      const response = await fetch('/api/share-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const body = (await response.json().catch(() => ({}))) as {
        token?: ShareTokenSummary
        secret?: string
        error?: string
      }
      if (!response.ok || !body.token || !body.secret) {
        setError(body.error ?? 'Could not create a token. Try again.')
        return
      }
      setTokens((current) => [body.token!, ...current])
      setFresh({ id: body.token.id, secret: body.secret })
      onCreated?.(body.secret)
    } catch {
      setError('Could not create a token. Check your connection and try again.')
    } finally {
      setCreating(false)
    }
  }

  const revoke = async (token: ShareTokenSummary) => {
    if (!window.confirm(`Revoke "${token.name}"? Shortcuts using it will stop working.`)) return
    setRevoking(token.id)
    try {
      const response = await fetch(`/api/share-tokens/${encodeURIComponent(token.id)}`, { method: 'DELETE' })
      if (!response.ok && response.status !== 404) throw new Error(`revoke failed: ${response.status}`)
      setTokens((current) => current.filter((t) => t.id !== token.id))
      if (fresh?.id === token.id) setFresh(null)
      notify.success(`Revoked "${token.name}"`)
    } catch {
      notify.error('Could not revoke the token. Try again.')
    } finally {
      setRevoking(null)
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="share-token-name">Token name</Label>
          <Input
            id="share-token-name"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. My iPhone"
          />
        </div>
        <Button type="submit" disabled={creating || name.trim().length === 0} className="min-h-10">
          <KeyRound className="mr-2 h-4 w-4" aria-hidden />
          {creating ? 'Creating…' : 'Create token'}
        </Button>
      </form>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {fresh && (
        <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
          <p className="text-sm font-medium">Copy this token now. You will not be able to see it again.</p>
          <CopyField value={fresh.secret} label="new share token" />
          <p className="text-xs text-muted-foreground">
            In the Shortcut, the Authorization header is <code className="font-mono">Bearer</code>, a space, then this token.
          </p>
        </div>
      )}

      {tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground">No share tokens yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border" aria-label="Share tokens">
          {tokens.map((token) => (
            <li key={token.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{token.name}</p>
                <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  <span className="font-mono">{token.tokenPrefix}…</span>
                  <span>Created {formatDate(token.createdAt)}</span>
                  <span>{token.lastUsedAt ? `Last used ${formatDate(token.lastUsedAt)}` : 'Never used'}</span>
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => revoke(token)}
                disabled={revoking === token.id}
                aria-label={`Revoke ${token.name}`}
                className="min-h-10 shrink-0 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                <span className="ml-1.5 hidden sm:inline">{revoking === token.id ? 'Revoking…' : 'Revoke'}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
