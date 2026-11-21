import { Link } from 'react-router';
import { STATUSES, type BeanStatus } from '@shared/lookups';
import { dayKey, dayLabel, daysBetween, inDays, MO, parseDay, WD } from '@shared/logic/dates';
import { mean } from '@shared/logic/model';
import { fmtInt, fmtN, plural, r1 } from '@shared/logic/units';
import { ellipsis, money } from '../lib/format';
import { useActions, useModel } from '../lib/queries';
import { BeanCard } from '../components/BeanCard';
import { BrewRow } from '../components/BrewRow';
import { Icon } from '../components/Icon';
import { STATUS_ICON } from '../lib/statusIcons';
import { Empty, Stat } from '../components/ui';
import { useSheets } from '../sheets/context';

export function Home() {
  const data = useModel();
  const sheets = useSheets();
  const actions = useActions();
  if (!data) return null;
  const { m, state } = data;
  const s = state.settings;
  const now = new Date();
  const hr = now.getHours();
  const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const today = m.brews.filter((b) => b.key === dayKey(now));
  const week = m.brews.filter((b) => daysBetween(b.date, now) <= 6);
  const r30 = m.brews.filter((b) => daysBetween(b.date, now) <= 29 && b.rating != null);
  const avg30 = mean(r30.map((b) => b.rating!));
  const cpc = mean(
    m.brews.filter((b) => daysBetween(b.date, now) <= 29 && b.cup != null).map((b) => b.cup!),
  );
  const drinking = m.beans
    .filter((b) => b.status === 'drinking')
    .sort((a, b) => (b.last?.date.getTime() ?? 0) - (a.last?.date.getTime() ?? 0));
  const resting = m.beans.filter((b) => b.status === 'resting');
  const freezer = m.beans.filter((b) => b.status === 'freezing');
  const incoming = m.beans.filter((b) => b.status === 'ordered');
  const needs = m.brews
    .filter((b) => b.rating == null && !b.rating_skipped && daysBetween(b.date, now) <= 7)
    .slice(0, 8);
  const upRow = (id: string, st: BeanStatus, title: string, sub: string, roaster: string) => (
    <div className="ri" key={id}>
      <button type="button" className="rm" onClick={() => sheets.bean(id)}>
        <StatusDot status={st} />
        <div className="mid">
          <div className="t1">
            {title}
            {roaster && <span> · {roaster}</span>}
          </div>
          <div className="t2">{sub}</div>
        </div>
      </button>
    </div>
  );

  return (
    <div>
      <div className="card hero">
        <div>
          <div className="sub">{`${WD[now.getDay()]}, ${MO[now.getMonth()]} ${now.getDate()}`}</div>
          <h1 className="page-t">{greet}</h1>
          <div className="sub" style={{ marginTop: 4 }}>
            {today.length === 0
              ? 'Nothing brewed yet today.'
              : `${plural(today.length, 'brew')} so far today.`}
          </div>
        </div>
        <div className="acts">
          <button type="button" className="btn primary" onClick={() => sheets.log()}>
            <Icon name="plus" size={18} /> Log a brew
          </button>
        </div>
      </div>

      <div className="stats">
        <Stat v={week.length} l="Brews, 7 days" d={`${fmtInt(m.brews.length)} all time`} />
        <Stat
          v={avg30 != null ? fmtN(r1(avg30)) : '–'}
          l="Avg rating, 30d"
          d={`${fmtInt(r30.length)} rated`}
        />
        <Stat
          v={m.runway != null ? `${fmtInt(m.runway)} d` : '–'}
          l="Stock runway"
          d={`${fmtInt(m.stock)} g on hand`}
        />
        <Stat
          v={cpc != null ? money(cpc, s.currency) : '–'}
          l="Cost per brew, 30d"
          d={m.burn ? `Avg. ${fmtInt(m.burn)} g / day` : undefined}
        />
      </div>

      {needs.length > 0 && (
        <div className="sec">
          <div className="sec-h">
            <h2>
              <Icon name="star" size={20} />
              Waiting for a rating
            </h2>
            <button
              type="button"
              className="more"
              onClick={() =>
                needs.forEach((b) => void actions.brews.update(b.id, { rating_skipped: true }))
              }
            >
              Skip all
            </button>
          </div>
          <div className="hscroll">
            {needs.map((b) => (
              <button key={b.id} type="button" className="chip" onClick={() => sheets.rate(b.id)}>
                #{b.num} · {ellipsis(b.beanName, 24)} · {dayLabel(b.date, now).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="sec">
        <div className="sec-h">
          <h2>
            <Icon name="bag" size={20} />
            On the bar
          </h2>
          <Link className="more" to="/beans">
            Beans
          </Link>
        </div>
        {drinking.length ? (
          <div className="grid">
            {drinking.map((b) => (
              <BeanCard key={b.id} b={b} m={m} />
            ))}
          </div>
        ) : (
          <div className="card">
            {m.beans.length ? (
              <Empty icon="bag" title="Nothing open">
                Open a bag from the Beans tab.
              </Empty>
            ) : (
              <Empty icon="bean" title="No Bags yet">
                Add your first bag of coffee to start logging.
                <div>
                  <button type="button" className="btn primary" onClick={() => sheets.beanForm()}>
                    Add a bag
                  </button>
                </div>
              </Empty>
            )}
          </div>
        )}
      </div>

      {(resting.length > 0 || freezer.length > 0 || incoming.length > 0) && (
        <div className="sec">
          <div className="sec-h">
            <h2>
              <Icon name="clock" size={20} />
              Up next
            </h2>
          </div>
          <div className="card flat">
            {resting.map((b) => {
              const x = b.rest_until ? daysBetween(now, parseDay(b.rest_until)) : null;
              return upRow(
                b.id,
                'resting',
                b.name,
                x == null ? 'Resting' : x > 0 ? `Ready in ${inDays(x)}` : 'Ready to open',
                b.roasterName,
              );
            })}
            {freezer.length > 0 && (
              <div className="ri">
                <Link
                  className="rm"
                  to="/beans?f=freezing"
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  <StatusDot status="freezing" />
                  <div className="mid">
                    <div className="t1">
                      {freezer.length} {freezer.length === 1 ? 'bag' : 'bags'} in the freezer
                    </div>
                    <div className="t2">
                      {fmtInt(freezer.reduce((a, b) => a + (b.bag_g ?? 0), 0))} g banked
                    </div>
                  </div>
                </Link>
              </div>
            )}
            {incoming.map((b) => {
              const st = STATUSES.find((x) => x.key === b.status)!;
              return upRow(b.id, st.key, b.name, st.label, b.roasterName);
            })}
          </div>
        </div>
      )}

      {m.brews.length > 0 && (
        <div className="sec">
          <div className="sec-h">
            <h2>
              <Icon name="dripper" size={20} />
              Recent brews
            </h2>
            <Link className="more" to="/brews">
              All brews
            </Link>
          </div>
          <div className="card flat" style={{ padding: '4px 16px' }}>
            {m.brews.slice(0, 6).map((b) => (
              <BrewRow
                key={b.id}
                b={b}
                s={s}
                showDate={daysBetween(b.date, now) === 0 ? undefined : dayLabel(b.date, now)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** A bag's status in its timeline circle (the same colours as the bag's Timeline). */
function StatusDot({ status }: { status: BeanStatus }) {
  return (
    <span className={`st-dot s-${status}`}>
      <Icon name={STATUS_ICON[status]} size={17} />
    </span>
  );
}
