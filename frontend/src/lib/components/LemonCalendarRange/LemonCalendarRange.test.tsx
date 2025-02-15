import React, { useState } from 'react'
import { render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getByDataAttr } from '~/test/byDataAttr'
import { LemonCalendarRange } from 'lib/components/LemonCalendarRange/LemonCalendarRange'

describe('LemonCalendarRange', () => {
    test('select various ranges', async () => {
        const onClose = jest.fn()
        const onChange = jest.fn()

        function TestRange(): JSX.Element {
            const [value, setValue] = useState(['2022-02-10', '2022-02-28'] as [string, string])
            return (
                <LemonCalendarRange
                    months={1}
                    value={value}
                    onClose={onClose}
                    onChange={(value) => {
                        setValue(value)
                        onChange(value)
                    }}
                />
            )
        }
        const { container } = render(<TestRange />)

        // find just one month
        const calendar = getByDataAttr(container, 'lemon-calendar')
        expect(calendar).toBeDefined()

        // find February 2022
        expect(await within(calendar).findByText('February 2022')).toBeDefined()

        async function clickOn(day: string): Promise<void> {
            userEvent.click(await within(container).findByText(day))
            userEvent.click(getByDataAttr(container, 'lemon-calendar-range-apply'))
        }

        // click on 15
        await clickOn('15')
        expect(onChange).toHaveBeenCalledWith(['2022-02-15', '2022-02-28'])

        // click on 27
        await clickOn('27')
        expect(onChange).toHaveBeenCalledWith(['2022-02-15', '2022-02-27'])

        // click on 16
        await clickOn('16')
        expect(onChange).toHaveBeenCalledWith(['2022-02-16', '2022-02-27'])

        // click on 26
        await clickOn('26')
        expect(onChange).toHaveBeenCalledWith(['2022-02-16', '2022-02-26'])

        // click on 10
        await clickOn('10')
        expect(onChange).toHaveBeenCalledWith(['2022-02-10', '2022-02-26'])

        // click on 28
        await clickOn('28')
        expect(onChange).toHaveBeenCalledWith(['2022-02-10', '2022-02-28'])

        // click on 20
        await clickOn('20')
        expect(onChange).toHaveBeenCalledWith(['2022-02-20', '2022-02-28'])

        userEvent.click(getByDataAttr(container, 'lemon-calendar-range-cancel'))
        expect(onClose).toHaveBeenCalled()
    })
})
