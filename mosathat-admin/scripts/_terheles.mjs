export async function terhel(q, nap, szazalek) {
  const START = (await q(`select id from packages where code = 'START'`))[0].id
  const id = (await q(`select create_booking($1) id`, [JSON.stringify({
    category: 'SZEMELYAUTO', scope: 'TELJES', package_id: START, booking_type: 'LEADOS', service_date: nap,
    drop_off_time: '08:00', customer_name: 'Töltelék', customer_phone: '+36 30 000 9999', plate_raw: `TLT-${nap.slice(5).replace('-', '')}`,
  })]))[0].id
  const kap = (await q(`select capacity_minutes, booked_minutes from day_capacity($1::date)`, [nap]))[0]
  const jelenlegi = (await q(`select planned_duration_minutes p from bookings where id = $1`, [id]))[0].p
  const kell = Math.round(kap.capacity_minutes * szazalek / 100) - (kap.booked_minutes - jelenlegi)
  await q(`update bookings set planned_duration_minutes = $2 where id = $1`, [id, Math.max(kell, 1)])
  return Number((await q(`select load_pct from day_capacity($1::date)`, [nap]))[0].load_pct)
}
