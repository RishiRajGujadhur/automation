import { Dropdown } from '../radix';
import { menuEntries, useRiderCommands, type RiderMenu } from './commands';

/** Web menu bar menus for the Rider commands (the desktop app has them in its native menus). */
export default function RiderMenubar({ menus }: { menus: RiderMenu[] }) {
  const commands = useRiderCommands();
  return (
    <>
      {menus.map((m) => {
        const entries = menuEntries(m, commands);
        if (!entries.length) return null;
        return <Dropdown key={m} label={m} className="menubar" trigger={<button className="menubar-item" aria-label={`${m} menu`}>{m}</button>} entries={entries} />;
      })}
    </>
  );
}
