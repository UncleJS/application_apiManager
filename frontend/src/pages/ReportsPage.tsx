import { useEffect, useState } from "react";
import { getOrgMonthlyReport, getOrgWeeklyReport, getUserMonthlyReport, getUserWeeklyReport } from "../api";

type ReportTotals = {
  allowed_count: number;
  denied_count: number;
  total_count: number;
  request_bytes_total: number;
  response_bytes_total: number;
  total_bytes_total: number;
};

type ReportState = {
  items: any[];
  totals: ReportTotals;
};

const emptyReport: ReportState = {
  items: [],
  totals: {
    allowed_count: 0,
    denied_count: 0,
    total_count: 0,
    request_bytes_total: 0,
    response_bytes_total: 0,
    total_bytes_total: 0
  }
};

export default function ReportsPage() {
  const [orgWeekly, setOrgWeekly] = useState<ReportState>(emptyReport);
  const [orgMonthly, setOrgMonthly] = useState<ReportState>(emptyReport);
  const [userWeekly, setUserWeekly] = useState<ReportState>(emptyReport);
  const [userMonthly, setUserMonthly] = useState<ReportState>(emptyReport);

  useEffect(() => {
    const load = async () => {
      const [ow, om, uw, um] = await Promise.all([
        getOrgWeeklyReport(),
        getOrgMonthlyReport(),
        getUserWeeklyReport(),
        getUserMonthlyReport()
      ]);
      setOrgWeekly(ow);
      setOrgMonthly(om);
      setUserWeekly(uw);
      setUserMonthly(um);
    };
    load();
  }, []);

  const renderTable = (items: any[], totals: any, type: "org" | "user") => (
    <table className="table">
      <thead>
        <tr>
          <th>{type === "org" ? "Organization" : "User"}</th>
          <th>Allowed</th>
          <th>Denied</th>
          <th>Total</th>
          <th>Req bytes</th>
          <th>Resp bytes</th>
          <th>Total bytes</th>
        </tr>
      </thead>
      <tbody>
        {items.map((row) => (
          <tr key={type === "org" ? row.organization_id : row.user_id}>
            <td>{type === "org" ? row.organization_name : row.username}</td>
            <td>{row.allowed_count}</td>
            <td>{row.denied_count}</td>
            <td>{row.total_count}</td>
            <td>{row.request_bytes_total}</td>
            <td>{row.response_bytes_total}</td>
            <td>{row.total_bytes_total}</td>
          </tr>
        ))}
        <tr>
          <td className="tag">Totals</td>
          <td>{totals.allowed_count}</td>
          <td>{totals.denied_count}</td>
          <td>{totals.total_count}</td>
          <td>{totals.request_bytes_total}</td>
          <td>{totals.response_bytes_total}</td>
          <td>{totals.total_bytes_total}</td>
        </tr>
      </tbody>
    </table>
  );

  return (
    <div>
      <h1 className="page-title">Reports</h1>
      <div className="card">
        <h3>Weekly org report</h3>
        {renderTable(orgWeekly.items, orgWeekly.totals, "org")}
      </div>
      <div className="card">
        <h3>Monthly org report</h3>
        {renderTable(orgMonthly.items, orgMonthly.totals, "org")}
      </div>
      <div className="card">
        <h3>Weekly user report</h3>
        {renderTable(userWeekly.items, userWeekly.totals, "user")}
      </div>
      <div className="card">
        <h3>Monthly user report</h3>
        {renderTable(userMonthly.items, userMonthly.totals, "user")}
      </div>
    </div>
  );
}
