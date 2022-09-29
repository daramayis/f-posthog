import React, { useEffect, useState } from 'react'
import { PageHeader } from 'lib/components/PageHeader'
import { billingLogic } from './billingLogic'
import { LemonButton, LemonDivider, LemonInput, LemonSwitch, lemonToast } from '@posthog/lemon-ui'
import { useActions, useValues } from 'kea'
import { SpinnerOverlay } from 'lib/components/Spinner/Spinner'
import { Form } from 'kea-forms'
import { Field } from 'lib/forms/Field'
import { AlertMessage } from 'lib/components/AlertMessage'
import { LemonDialog } from 'lib/components/LemonDialog'
import { BillingProductV2Type } from '~/types'

export function BillingV2(): JSX.Element {
    const { billing, billingLoading, isActivateLicenseSubmitting, showLicenseDirectInput } = useValues(billingLogic)
    const { setShowLicenseDirectInput } = useActions(billingLogic)

    if (!billing && billingLoading) {
        return <SpinnerOverlay />
    }

    return (
        <div>
            <PageHeader title="Billing &amp; usage" />

            {!billing && !billingLoading ? (
                <AlertMessage type="error">
                    There was an issue retreiving your current billing information. If this message persists please
                    contact support.
                </AlertMessage>
            ) : (
                <div className="flex">
                    <div className="flex-1">
                        <p>Paying is good because money is good 👍</p>

                        {billing?.billing_period ? (
                            <p>
                                Your current billing period is from{' '}
                                <b>{billing.billing_period.current_period_start.format('LL')}</b> to{' '}
                                <b>{billing.billing_period.current_period_end.format('LL')}</b>
                            </p>
                        ) : null}
                    </div>

                    <LemonDivider vertical dashed />

                    <div className="p-4 space-y-2" style={{ width: '20rem' }}>
                        {billing?.stripe_portal_url ? (
                            <LemonButton
                                type="primary"
                                htmlType="submit"
                                to={billing.stripe_portal_url}
                                disableClientSideRouting
                                fullWidth
                                center
                            >
                                Manage subscription
                            </LemonButton>
                        ) : showLicenseDirectInput ? (
                            <>
                                <Form
                                    logic={billingLogic}
                                    formKey="activateLicense"
                                    enableFormOnSubmit
                                    className="space-y-4"
                                >
                                    <Field name="license" label={'Activate license key'}>
                                        <LemonInput fullWidth autoFocus />
                                    </Field>

                                    <LemonButton
                                        type="primary"
                                        htmlType="submit"
                                        loading={isActivateLicenseSubmitting}
                                        fullWidth
                                        center
                                    >
                                        Activate license key
                                    </LemonButton>
                                </Form>
                            </>
                        ) : (
                            <>
                                <LemonButton
                                    to="/api/billing-v2/activation"
                                    type="primary"
                                    size="large"
                                    fullWidth
                                    center
                                    disableClientSideRouting
                                >
                                    Setup payment
                                </LemonButton>
                            </>
                        )}

                        {!billing?.stripe_portal_url ? (
                            <LemonButton
                                fullWidth
                                center
                                onClick={() => setShowLicenseDirectInput(!showLicenseDirectInput)}
                            >
                                {!showLicenseDirectInput
                                    ? 'I already have a license key'
                                    : "I don't have a license key"}
                            </LemonButton>
                        ) : null}
                    </div>
                </div>
            )}

            {billing?.products?.map((x) => (
                <>
                    <LemonDivider dashed className="my-2" />
                    <BillingProduct product={x} customLimitUsd={billing.custom_limits_usd?.[x.type]} />
                </>
            ))}
        </div>
    )
}

const summarizeUsage = (usage: number): string => {
    if (usage < 1000) {
        return `${usage} events`
    } else if (Math.round(usage / 1000) < 1000) {
        return `${Math.round(usage / 1000)} thousand`
    } else {
        return `${Math.round(usage / 1000000)} million`
    }
}

const BillingProduct = ({
    product,
    customLimitUsd,
}: {
    product: BillingProductV2Type
    customLimitUsd?: string
}): JSX.Element => {
    const { billingLoading } = useValues(billingLogic)
    const { updateBillingLimits } = useActions(billingLogic)

    const [showBillingLimit, setShowBillingLimit] = useState(false)
    const [billingLimit, setBillingLimit] = useState(100)

    const updateBillingLimit = (value: number | null): any => {
        updateBillingLimits({
            [product.type]: `${value}`,
        })
    }

    useEffect(() => {
        setShowBillingLimit(!!customLimitUsd)
        setBillingLimit(parseInt(customLimitUsd || '100'))
    }, [customLimitUsd])

    const onBillingLimitToggle = (): void => {
        if (!showBillingLimit) {
            return setShowBillingLimit(true)
        }
        if (!customLimitUsd) {
            return setShowBillingLimit(false)
        }
        LemonDialog.open({
            title: 'Remove billing limit',
            description:
                'Your predicted usage is above your current billing limit which is likely to result in a bill. Are you sure you want to remove the limit?',
            primaryButton: {
                children: 'Yes, remove the limit',
                onClick: () => updateBillingLimit(null),
            },
            secondaryButton: {
                children: 'I changed my mind',
            },
        })
    }

    return (
        <div className="flex">
            <div className="flex-1 py-4 pr-2 space-y-4">
                <div className="flex justify-between items-start">
                    <div>
                        <h3>{product.name}</h3>
                        <p>{product.description}</p>
                    </div>
                    <div className="space-y-2 flex flex-col items-end">
                        <LemonSwitch
                            checked={showBillingLimit}
                            label="Set billing limit"
                            onChange={onBillingLimitToggle}
                        />
                        {showBillingLimit ? (
                            <div className="flex items-center gap-2" style={{ width: 200 }}>
                                <LemonInput
                                    type="number"
                                    fullWidth={false}
                                    value={billingLimit}
                                    onChange={setBillingLimit}
                                    prefix={<b>$</b>}
                                    disabled={billingLoading}
                                    suffix={
                                        <>
                                            /month
                                            <LemonButton
                                                onClick={() => updateBillingLimit(billingLimit)}
                                                size="small"
                                                disabled={parseInt(customLimitUsd || '-1') === billingLimit}
                                                loading={billingLoading}
                                            >
                                                Save
                                            </LemonButton>
                                        </>
                                    }
                                />
                            </div>
                        ) : null}
                    </div>
                </div>

                {product.current_amount_usd ? (
                    <div>
                        <div className="flex gap-2">
                            <span>Current bill:</span>
                            <span className="font-bold">${product.current_amount_usd}</span>
                        </div>
                        <div className="flex gap-2">
                            <span>Predicted bill:</span>
                            <span className="font-bold">${parseFloat(product.current_amount_usd) * 100}</span>
                        </div>
                    </div>
                ) : null}

                <div className="">
                    <div className="rounded-lg bg-border-light h-2">
                        <div className="rounded-lg bg-success h-2 w-1/3" />
                    </div>
                </div>

                {product.free_allocation}
                {product.current_usage}
                {product.usage_limit}
            </div>

            <LemonDivider vertical dashed />

            <div className="p-4 space-y-2 text-xs" style={{ width: '20rem' }}>
                <h4>Pricing breakdown</h4>
                <p>Pay per {product.type.toLowerCase()}</p>
                <ul>
                    {product.tiers.map((tier, i) => (
                        <li key={i} className="flex justify-between border-b border-dashed py-2">
                            <span>
                                {i === 0
                                    ? `First ${summarizeUsage(tier.up_to)} ${product.type.toLowerCase()} / mo`
                                    : tier.up_to
                                    ? `${summarizeUsage(product.tiers[i - 1].up_to)} - ${summarizeUsage(tier.up_to)}`
                                    : `> ${summarizeUsage(product.tiers[i - 1].up_to)}`}
                            </span>
                            <b>{tier.unit_amount_usd !== 0 ? `$${tier.unit_amount_usd.toPrecision(3)}` : 'Free'}</b>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    )
}
