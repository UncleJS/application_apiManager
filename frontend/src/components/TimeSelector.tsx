type Props = {
  value: string;
  onChange: (value: string) => void;
};

const TIMES = Array.from({ length: 24 * 12 }).map((_, index) => {
  const totalMinutes = index * 5;
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
});

export default function TimeSelector({ value, onChange }: Props) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {TIMES.map((time) => (
        <option key={time} value={time}>
          {time}
        </option>
      ))}
    </select>
  );
}
