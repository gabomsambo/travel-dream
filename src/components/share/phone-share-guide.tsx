"use client"

import { useState, type ReactNode } from 'react'
import { ShareTokenManager } from '@/components/share/share-token-manager'
import { CopyField } from '@/components/share/copy-field'
import type { ShareTokenSummary } from '@/types/share-tokens'

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <h3 className="font-semibold leading-7">{title}</h3>
        <div className="space-y-2 text-sm text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
          {children}
        </div>
      </div>
    </li>
  )
}

function Section({ id, title, intro, children }: { id: string; title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-border bg-card p-4 sm:p-6">
      <h2 id={id} className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{intro}</p>
      <div className="mt-5">{children}</div>
    </section>
  )
}

/**
 * Step-by-step setup for saving links from a phone's share sheet: an iPhone
 * Shortcut that posts to `/api/share/links` with a personal token, and the
 * installed web app as a share target on Android and desktop Chrome.
 */
export function PhoneShareGuide({
  endpoint,
  appOrigin,
  initialTokens,
}: {
  /** Absolute URL of `POST /api/share/links` on this deployment. */
  endpoint: string
  appOrigin: string
  initialTokens: ShareTokenSummary[] | null
}) {
  const [secret, setSecret] = useState<string | null>(null)
  const host = new URL(appOrigin).host

  return (
    <div className="space-y-6">
      <Section
        id="iphone-shortcut"
        title="iPhone and iPad: a Shortcut"
        intro={
          <>
            A Shortcut adds <strong className="font-semibold text-foreground">Save to Travel Dream</strong> to the share
            sheet in TikTok, Instagram and Safari. You build it once in Apple&apos;s Shortcuts app (about three minutes).
            There is no file to download: Apple only imports shortcut files signed on a Mac or shared through iCloud.
          </>
        }
      >
        <ol className="space-y-6">
          <Step n={1} title="Create a share token">
            <p>The Shortcut uses this token instead of your login. It can only save links to your Inbox.</p>
            <ShareTokenManager initialTokens={initialTokens} defaultName="iPhone" onCreated={setSecret} />
          </Step>

          <Step n={2} title="Start a new shortcut">
            <p>
              Open the <strong>Shortcuts</strong> app and tap <strong>+</strong>. Tap the name at the top, choose{' '}
              <strong>Rename</strong> and call it <strong>Save to Travel Dream</strong>.
            </p>
          </Step>

          <Step n={3} title="Show it in the share sheet">
            <p>
              Tap the <strong>ⓘ</strong> button at the bottom, turn on <strong>Show in Share Sheet</strong> and tap{' '}
              <strong>Done</strong>.
            </p>
            <p>
              The first line now reads <em>Receive Any input from Share Sheet</em>. Tap <strong>Any</strong>, tap{' '}
              <strong>Clear</strong>, select only <strong>URLs</strong> and tap <strong>Done</strong>. Then tap{' '}
              <em>If there&apos;s no input: Continue</em> and choose <strong>Get Clipboard</strong>, so the shortcut also
              works on a link you copied.
            </p>
          </Step>

          <Step n={4} title="Send the link to Travel Dream">
            <p>
              Tap <strong>Search Actions</strong>, find <strong>Get Contents of URL</strong> and add it. Tap the blue{' '}
              <strong>URL</strong> placeholder and paste:
            </p>
            <CopyField value={endpoint} label="Shortcut URL" />
            <p>
              Tap the <strong>›</strong> arrow on the action to show its options, then set:
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong>Method</strong>: POST
              </li>
              <li>
                <strong>Headers</strong>: tap <strong>Add new header</strong>. Key: <code className="font-mono">Authorization</code>.
                Value: <code className="font-mono">Bearer</code>, one space, then your token:
              </li>
            </ul>
            {secret ? (
              <CopyField value={`Bearer ${secret}`} label="Authorization header value" />
            ) : (
              <p className="rounded-lg border border-dashed border-border px-3 py-2 font-mono text-xs">
                Bearer td_share_… (create a token in step 1 to copy the full value)
              </p>
            )}
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong>Request Body</strong>: JSON. Tap <strong>Add new field</strong>, choose <strong>Text</strong>. Key:{' '}
                <code className="font-mono">url</code>. For the value, tap the field and pick{' '}
                <strong>Shortcut Input</strong> from the bar above the keyboard.
              </li>
            </ul>
          </Step>

          <Step n={5} title="Show what happened">
            <p>
              Add <strong>Get Dictionary Value</strong>. Set it to get the <strong>Value</strong> for key{' '}
              <code className="font-mono">message</code> in <strong>Contents of URL</strong>.
            </p>
            <p>
              Add <strong>Show Notification</strong> and set its text to <strong>Dictionary Value</strong>. You will see{' '}
              <em>Saved to your Travel Dream Inbox.</em>, or a sentence explaining what went wrong.
            </p>
            <p>
              Optional, to jump to the saved link: add another <strong>Get Dictionary Value</strong> for key{' '}
              <code className="font-mono">inboxUrl</code> in <strong>Contents of URL</strong>, then add{' '}
              <strong>Open URLs</strong>.
            </p>
          </Step>

          <Step n={6} title="Try it">
            <p>
              In TikTok, tap <strong>Share</strong>, then <strong>More</strong> (or <strong>Share to</strong>). In Instagram,
              tap the paper plane, then <strong>Share to…</strong>. Pick <strong>Save to Travel Dream</strong> from the
              share sheet. The first time, allow the shortcut to connect to <strong>{host}</strong>.
            </p>
            <p>
              The link appears in your <strong>Inbox</strong> under Saved links, and the places in it show up to review
              once they have been read.
            </p>
          </Step>
        </ol>
      </Section>

      <Section
        id="android-share"
        title="Android and desktop Chrome: install the app"
        intro="Installed from Chrome, Travel Dream shows up as a share target like any other app. Safari does not support this, so on iPhone use the Shortcut above."
      >
        <ol className="space-y-6">
          <Step n={1} title="Install Travel Dream">
            <p>
              Open <strong>{host}</strong> in Chrome and sign in. Open Chrome&apos;s <strong>⋮</strong> menu and tap{' '}
              <strong>Add to Home screen</strong> (or <strong>Install app</strong>), then <strong>Install</strong>. On a
              computer, use the install icon in the address bar.
            </p>
          </Step>
          <Step n={2} title="Share a post to it">
            <p>
              In TikTok or Instagram, tap <strong>Share</strong>, then <strong>More</strong> or <strong>Share to</strong>,
              and pick <strong>Tabi Dreams</strong>. Travel Dream opens on the saved link in your Inbox. If you are signed
              out, it asks you to sign in first, then asks for one tap to confirm before saving the link.
            </p>
          </Step>
        </ol>
      </Section>

      <Section
        id="share-troubleshooting"
        title="If something goes wrong"
        intro="The Shortcut's notification says what happened. The common cases:"
      >
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            <em>This share token is not valid</em>: the header must be exactly <code className="font-mono">Bearer</code>, one
            space, then the whole token. Copy it again, or create a new token.
          </li>
          <li>
            <em>This share token was revoked</em>: create a new token in step 1 and paste it into the header.
          </li>
          <li>
            <em>Paste a TikTok or Instagram post…</em>: only TikTok and Instagram links can be saved for now.
          </li>
          <li>
            Nothing appears in the share sheet: scroll to the end of the app list and tap <strong>Edit Actions</strong> or{' '}
            <strong>More</strong>, and check that <strong>Show in Share Sheet</strong> is on for the shortcut.
          </li>
        </ul>
      </Section>
    </div>
  )
}
