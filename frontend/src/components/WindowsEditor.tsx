import { useEffect, useState } from "react";
import { archiveWindow, createWindow, getWindows } from "../api";
import TimeSelector from "./TimeSelector";

const DAY_OPTIONS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" }
];

type Props = {
  subjectType: "user" | "api";
  subjectId: number;
};

export default function WindowsEditor({ subjectType, subjectId }: Props) {
  const [items, setItems] = useState<any[]>([]);
  const [day, setDay] = useState(1);
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("17:00");

  const load = async () => {
    const data = await getWindows(subjectType, subjectId);
    setItems(data.items);
  };

  useEffect(() => {
    load();
  }, [subjectType, subjectId]);

  const handleAdd = async () => {
    await createWindow({
      subjectType,
      subjectId,
      dayOfWeek: day,
      startTime: start,
      endTime: end
    });
    await load();
  };

  const handleArchive = async (id: number) => {
    await archiveWindow(id);
    await load();
  };

  return (
    <div className="card">
      <h3>Access windows</h3>
      <div className="form-row">
        <div>
          <label>Day</label>
          <select value={day} onChange={(event) => setDay(Number(event.target.value))}>
            {DAY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Start</label>
          <TimeSelector value={start} onChange={setStart} />
        </div>
        <div>
          <label>End</label>
          <TimeSelector value={end} onChange={setEnd} />
        </div>
        <div>
          <label>&nbsp;</label>
          <button onClick={handleAdd}>Add window</button>
        </div>
      </div>

      <div className="window-list">
        {items.map((window) => (
          <div key={window.id} className="window-item">
            <span>{DAY_OPTIONS.find((dayItem) => dayItem.value === window.day_of_week)?.label}</span>
            <span>{window.start_time}</span>
            <span>{window.end_time}</span>
            <div>
              {window.is_active ? (
                <button className="secondary" onClick={() => handleArchive(window.id)}>
                  Archive
                </button>
              ) : (
                <span className="muted">Archived</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
