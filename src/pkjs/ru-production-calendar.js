/* Russian production calendar (производственный календарь).
 *
 * Nager.Date only returns public holidays; it does not know about the Russian
 * government's annual day-off transfers (переносы), so a calendar built from it
 * is wrong every January. These tables carry the official non-working days
 * instead, and take precedence over the fetched data for the years they cover.
 *
 * 2026 — final. Government decree No. 1466 of 24 September 2025.
 * 2027 — PROVISIONAL. Only a Ministry of Labour draft exists; the decree is
 *        expected in autumn 2026. Revisit once it is published.
 */

/** Non-working days, ISO dates. Weekends are handled separately by the watch. */
var CALENDAR = {
    2026: [
        // New Year holidays and Orthodox Christmas
        '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04',
        '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08',
        // transferred from Saturday 3 January
        '2026-01-09',
        '2026-02-23',
        // 8 March falls on a Sunday, so the Monday is a day off too
        '2026-03-08', '2026-03-09',
        '2026-05-01',
        // 9 May falls on a Saturday, so the Monday is a day off too
        '2026-05-09', '2026-05-11',
        '2026-06-12',
        '2026-11-04',
        // transferred from Sunday 4 January
        '2026-12-31'
    ],
    2027: [
        '2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04',
        '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08',
        // draft: transferred from Saturday 20 February
        '2027-02-22', '2027-02-23',
        '2027-03-08',
        // 1 May is a Saturday, 9 May a Sunday, 12 June a Saturday
        '2027-05-01', '2027-05-03',
        '2027-05-09', '2027-05-10',
        '2027-06-12', '2027-06-14',
        '2027-11-04',
        // draft: transferred from Saturday 2 January
        '2027-11-05',
        // draft: transferred from Sunday 3 January
        '2027-12-31'
    ]
};

/** Years whose data is still only a ministry draft. */
var PROVISIONAL_YEARS = { 2027: true };

/**
 * Non-working days for a year, or null when the year is not covered.
 *
 * @param {number} year Four-digit year.
 * @returns {string[]|null} ISO dates, or null.
 */
function datesForYear(year) {
    var dates = CALENDAR[year];
    return dates ? dates.slice() : null;
}

/**
 * Whether the built-in data for a year is still provisional.
 *
 * @param {number} year Four-digit year.
 * @returns {boolean} True when only a draft decree exists.
 */
function isProvisional(year) {
    return Boolean(PROVISIONAL_YEARS[year]);
}

module.exports = {
    datesForYear: datesForYear,
    isProvisional: isProvisional
};
