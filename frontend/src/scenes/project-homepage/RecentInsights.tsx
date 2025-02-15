import React, { useEffect } from 'react'
import './ProjectHomepage.scss'
import { useActions, useValues } from 'kea'
import { dayjs } from 'lib/dayjs'

import { CompactList } from 'lib/components/CompactList/CompactList'
import { LemonButton } from 'lib/components/LemonButton'
import { urls } from 'scenes/urls'
import { InsightModel } from '~/types'

import { InsightIcon } from 'scenes/saved-insights/SavedInsights'
import { projectHomepageLogic } from './projectHomepageLogic'
import { eventUsageLogic } from 'lib/utils/eventUsageLogic'

interface InsightRowProps {
    insight: InsightModel
}

export function InsightRow({ insight }: InsightRowProps): JSX.Element {
    const { reportInsightOpenedFromRecentInsightList } = useActions(eventUsageLogic)

    return (
        <LemonButton
            fullWidth
            to={urls.insightView(insight.short_id)}
            onClick={() => {
                reportInsightOpenedFromRecentInsightList()
            }}
        >
            <div className="ProjectHomePage__listrow">
                <InsightIcon insight={insight} />

                <div className="ProjectHomePage__listrow__details">
                    <div>{insight.name || insight.derived_name}</div>
                    <div>Last modified {dayjs(insight.last_modified_at).fromNow()}</div>
                </div>
            </div>
        </LemonButton>
    )
}

export function RecentInsights(): JSX.Element {
    const { recentInsights, recentInsightsLoading } = useValues(projectHomepageLogic)
    const { loadRecentInsights } = useActions(projectHomepageLogic)

    useEffect(() => {
        loadRecentInsights()
    }, [])
    return (
        <>
            <CompactList
                title="Your recently viewed insights"
                viewAllURL={urls.savedInsights()}
                loading={recentInsightsLoading}
                emptyMessage={{
                    title: 'You have no recently viewed insights',
                    description: "Explore this project's insights by clicking below.",
                    buttonText: 'View insights',
                    buttonTo: urls.savedInsights(),
                }}
                items={recentInsights.slice(0, 5)}
                renderRow={(insight: InsightModel, index) => <InsightRow key={index} insight={insight} />}
            />
        </>
    )
}
