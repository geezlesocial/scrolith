import React, { useMemo, useState } from 'react'
import { BriefcaseBusiness, MessageCircleMore, Store, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../../context/UserContext'
import { useNotification } from '../../context/NotificationContext'
import { MessagingService } from '../../services/messaging'
import type { ContentOfferTag } from '../../types'
import { formatOfferPrice, normalizeContentOfferTags } from '../../utils/contentOffers'

type ContentOfferTagsProps = {
  offerTags?: ContentOfferTag[] | null
  variant?: 'light' | 'dark'
  className?: string
}

const ContentOfferTags: React.FC<ContentOfferTagsProps> = ({
  offerTags,
  variant = 'light',
  className = ''
}) => {
  const navigate = useNavigate()
  const { user } = useUser()
  const { showNotification } = useNotification()
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const items = useMemo(() => normalizeContentOfferTags(offerTags), [offerTags])
  if (!items.length) return null

  const wrapperClassName =
    variant === 'dark'
      ? 'rounded-[24px] border border-white/10 bg-black/34 px-3.5 py-3 text-white shadow-[0_18px_48px_-28px_rgba(15,23,42,0.95)] backdrop-blur-md'
      : 'rounded-2xl border border-slate-200 bg-slate-50/70 p-3'
  const mutedClassName = variant === 'dark' ? 'text-white/70' : 'text-slate-500'
  const cardClassName =
    variant === 'dark'
      ? 'rounded-2xl border border-white/10 bg-white/5 p-3'
      : 'rounded-2xl border border-slate-200 bg-white p-3'

  const ensureAuth = () => {
    if (user?.id) return true
    if (window.confirm('Log in to message sellers or start a brief?')) window.location.href = '/auth/login'
    return false
  }

  const openConversation = async (tag: ContentOfferTag, composeBrief = false) => {
    const targetUserId = String(tag.messageUserId || tag.message_user_id || '').trim()
    if (!targetUserId) return
    if (!ensureAuth() || !user?.id) return
    if (String(user.id) === targetUserId) return
    const key = `${tag.id}:${composeBrief ? 'brief' : 'message'}`
    setBusyKey(key)
    try {
      const conversationId = await MessagingService.createConversation([
        { id: user.id, name: user.name || 'You', avatar: user.avatar, role: user.role },
        { id: targetUserId, name: tag.ownerName || tag.owner_name || tag.title || 'Seller', avatar: '' }
      ])
      navigate(
        composeBrief
          ? `/messages/${encodeURIComponent(conversationId)}?composeBrief=1`
          : `/messages/${encodeURIComponent(conversationId)}`
      )
    } catch (error: any) {
      showNotification('error', composeBrief ? 'Brief' : 'Messages', error?.message || 'Unable to open conversation.')
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className={`${wrapperClassName} ${className}`.trim()}>
      <div className="mb-3 flex items-center gap-2">
        <div
          className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl ${
            variant === 'dark' ? 'bg-cyan-400/15 text-cyan-200' : 'bg-cyan-50 text-cyan-700'
          }`}
        >
          <BriefcaseBusiness className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold">Tagged offers</p>
          <p className={`text-xs ${mutedClassName}`}>Commerce actions stay in context on this content surface.</p>
        </div>
      </div>

      <div className="space-y-3">
        {items.map((tag) => {
          const priceLabel = formatOfferPrice(tag.price, tag.currency)
          const storefrontUrl = String(tag.storefrontUrl || tag.storefront_url || '').trim()
          const targetUserId = String(tag.messageUserId || tag.message_user_id || '').trim()
          const isOwnOffer = Boolean(user?.id) && targetUserId && String(user?.id) === targetUserId

          return (
            <div key={tag.id} className={cardClassName}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{tag.title || 'Offer'}</p>
                  {tag.summary ? (
                    <p className={`mt-1 text-xs leading-5 ${mutedClassName}`}>
                      {String(tag.summary).slice(0, 220)}
                    </p>
                  ) : null}
                  <div className={`mt-2 flex flex-wrap gap-2 text-[11px] ${mutedClassName}`}>
                    {priceLabel ? <span>{priceLabel}</span> : null}
                    {tag.category ? <span>{tag.category}</span> : null}
                    {tag.ownerName || tag.owner_name ? <span>by {tag.ownerName || tag.owner_name}</span> : null}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                    variant === 'dark'
                      ? 'border border-white/10 bg-white/8 text-white/75'
                      : 'border border-slate-200 bg-slate-50 text-slate-600'
                  }`}
                >
                  {tag.offerType === 'business_package' ? 'Business offer' : 'Storefront service'}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {tag.ctas?.storefront !== false && storefrontUrl ? (
                  <button
                    type="button"
                    onClick={() => navigate(storefrontUrl)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                      variant === 'dark'
                        ? 'border border-cyan-300/20 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/15'
                        : 'border border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100'
                    }`}
                  >
                    <Store className="h-3.5 w-3.5" />
                    Open storefront
                  </button>
                ) : null}
                {tag.ctas?.message !== false && targetUserId && !isOwnOffer ? (
                  <button
                    type="button"
                    onClick={() => void openConversation(tag, false)}
                    disabled={busyKey === `${tag.id}:message`}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                      variant === 'dark'
                        ? 'border border-white/10 bg-white/8 text-white hover:bg-white/12'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    } disabled:opacity-60`}
                  >
                    {busyKey === `${tag.id}:message` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <MessageCircleMore className="h-3.5 w-3.5" />
                    )}
                    Message
                  </button>
                ) : null}
                {tag.ctas?.brief !== false && targetUserId && !isOwnOffer ? (
                  <button
                    type="button"
                    onClick={() => void openConversation(tag, true)}
                    disabled={busyKey === `${tag.id}:brief`}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                      variant === 'dark'
                        ? 'border border-emerald-300/20 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/15'
                        : 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    } disabled:opacity-60`}
                  >
                    {busyKey === `${tag.id}:brief` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <BriefcaseBusiness className="h-3.5 w-3.5" />
                    )}
                    Create brief
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ContentOfferTags
