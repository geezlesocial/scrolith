import React, { useEffect, useMemo, useState } from 'react'
import { Loader2, Tag } from 'lucide-react'
import { UserService } from '../../services/user'
import {
  CommunityService,
  type BusinessPageServicePackage
} from '../../services/community'
import {
  formatOfferPrice,
  mapBusinessPackageToOfferOption,
  mapGigToOfferOption,
  mergeUniqueOfferOptions,
  type OfferTagOption,
  type OfferTagSelection
} from '../../utils/contentOffers'

type OfferTagSelectorProps = {
  mode: 'user' | 'business'
  ownerUserId?: string | null
  businessPageId?: string | null
  value: OfferTagSelection[]
  onChange: (value: OfferTagSelection[]) => void
  maxTags?: number
  disabled?: boolean
  label?: string
  helperText?: string
  theme?: 'light' | 'dark'
}

const OfferTagSelector: React.FC<OfferTagSelectorProps> = ({
  mode,
  ownerUserId,
  businessPageId,
  value,
  onChange,
  maxTags = 3,
  disabled = false,
  label = 'Tag offers',
  helperText = 'Select products or services that should appear with this content.',
  theme = 'light'
}) => {
  const [loading, setLoading] = useState(false)
  const [options, setOptions] = useState<OfferTagOption[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (mode === 'user' && !ownerUserId) {
        setOptions([])
        return
      }
      if (mode === 'business' && !businessPageId) {
        setOptions([])
        return
      }
      setLoading(true)
      setError(null)
      try {
        if (mode === 'user') {
          const storefront = await UserService.getStorefront(String(ownerUserId))
          const next = mergeUniqueOfferOptions([
            ...(storefront.featuredServices || []).map(mapGigToOfferOption),
            ...(storefront.services || []).map(mapGigToOfferOption)
          ])
          if (!cancelled) setOptions(next)
          return
        }
        const storefront = await CommunityService.getBusinessPageStorefront(String(businessPageId))
        const normalizePackages = (items: BusinessPageServicePackage[]) =>
          (items || [])
            .filter((entry) => entry?.active !== false)
            .map(mapBusinessPackageToOfferOption)
        const next = mergeUniqueOfferOptions([
          ...normalizePackages(storefront.featuredPackages || []),
          ...normalizePackages(storefront.packages || [])
        ])
        if (!cancelled) setOptions(next)
      } catch (loadError: any) {
        if (!cancelled) {
          setOptions([])
          setError(loadError?.message || 'Unable to load offers.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [businessPageId, mode, ownerUserId])

  const selectedKeys = useMemo(
    () => new Set((value || []).map((entry) => `${entry.offerType}:${entry.offerId}`)),
    [value]
  )
  const optionMap = useMemo(
    () =>
      new Map(options.map((option) => [`${option.offerType}:${option.offerId}`, option])),
    [options]
  )

  const canSelectMore = (value || []).length < Math.max(1, Number(maxTags || 3))
  const surfaceClassName =
    theme === 'dark'
      ? 'rounded-2xl border border-white/15 bg-white/5 p-4 text-white'
      : 'rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-slate-900'
  const mutedClassName = theme === 'dark' ? 'text-white/65' : 'text-slate-500'
  const optionClassName =
    theme === 'dark'
      ? 'rounded-2xl border border-white/10 bg-black/20 px-4 py-3'
      : 'rounded-2xl border border-slate-200 bg-white px-4 py-3'

  return (
    <div className={surfaceClassName}>
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-2xl ${
            theme === 'dark' ? 'bg-cyan-400/15 text-cyan-200' : 'bg-cyan-50 text-cyan-700'
          }`}
        >
          <Tag className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{label}</p>
          <p className={`mt-1 text-xs leading-5 ${mutedClassName}`}>{helperText}</p>
        </div>
      </div>

      {value.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {value.map((entry) => (
            <span
              key={`${entry.offerType}:${entry.offerId}`}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                theme === 'dark'
                  ? 'border border-cyan-300/20 bg-cyan-400/10 text-cyan-100'
                  : 'border border-cyan-200 bg-cyan-50 text-cyan-700'
              }`}
            >
              {entry.offerType === 'business_package' ? 'Business offer' : 'Storefront service'}:{' '}
              {optionMap.get(`${entry.offerType}:${entry.offerId}`)?.title || entry.offerId}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {loading ? (
          <div className={`flex items-center gap-2 text-sm ${mutedClassName}`}>
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading offer inventory...
          </div>
        ) : error ? (
          <div className={`text-sm ${theme === 'dark' ? 'text-rose-200' : 'text-rose-600'}`}>{error}</div>
        ) : options.length === 0 ? (
          <div className={`text-sm ${mutedClassName}`}>
            {mode === 'business'
              ? 'No active business offers are available to tag yet.'
              : 'No approved storefront services are available to tag yet.'}
          </div>
        ) : (
          options.map((option) => {
            const key = `${option.offerType}:${option.offerId}`
            const selected = selectedKeys.has(key)
            const priceLabel = formatOfferPrice(option.price, option.currency)
            const blocked = !selected && !canSelectMore
            return (
              <label
                key={key}
                className={`${optionClassName} flex cursor-pointer items-start justify-between gap-3 ${
                  blocked ? 'opacity-60' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{option.title}</p>
                  {option.summary ? (
                    <p className={`mt-1 text-xs leading-5 ${mutedClassName}`}>
                      {String(option.summary).slice(0, 180)}
                    </p>
                  ) : null}
                  <div className={`mt-2 flex flex-wrap gap-2 text-[11px] ${mutedClassName}`}>
                    {priceLabel ? <span>{priceLabel}</span> : null}
                    {option.category ? <span>{option.category}</span> : null}
                    <span>{option.offerType === 'business_package' ? 'Business offer' : 'Storefront service'}</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={disabled || blocked}
                  onChange={(event) => {
                    if (event.target.checked) {
                      if (!selected && !canSelectMore) return
                      onChange([...(value || []), { offerType: option.offerType, offerId: option.offerId }])
                      return
                    }
                    onChange((value || []).filter((entry) => `${entry.offerType}:${entry.offerId}` !== key))
                  }}
                  className="mt-1 rounded text-cyan-600"
                />
              </label>
            )
          })
        )}
      </div>

      <p className={`mt-3 text-[11px] ${mutedClassName}`}>
        Up to {Math.max(1, Number(maxTags || 3))} tagged offers can appear on this content surface.
      </p>
    </div>
  )
}

export default OfferTagSelector
