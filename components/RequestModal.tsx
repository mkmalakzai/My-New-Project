"use client";

import { FormEvent, useState } from "react";
import { X } from "lucide-react";

type Props = {
  type: "deposit" | "withdraw";
  onClose: () => void;
};

export default function RequestModal({ type, onClose }: Props) {
  const [sent, setSent] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("USDT");
  const [reference, setReference] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    // Sensitive writes stay disabled until trusted Telegram identity
    // verification is connected. This prevents fake balance requests.
    setSent(true);
  }

  return <div className="modal-backdrop">
    <div className="request-modal">
      <div className="modal-head">
        <div><small>AFGlion Wallet</small><h3>{type === "deposit" ? "New Deposit" : "New Withdrawal"}</h3></div>
        <button onClick={onClose}><X size={19}/></button>
      </div>

      {sent ? <div className="modal-success">
        <div>🦁</div>
        <b>Form UI is ready</b>
        <p>Secure submission will activate after Telegram identity verification and Firebase rules are connected.</p>
        <button onClick={onClose}>Done</button>
      </div> :
      <form onSubmit={submit}>
        <label>Amount (USD)</label>
        <input required inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00"/>
        <label>Payment method</label>
        <select value={method} onChange={e=>setMethod(e.target.value)}>
          <option>USDT</option><option>Bank / Manual</option>
        </select>
        <label>{type === "deposit" ? "TXID / Reference" : "Wallet / Account"}</label>
        <input required value={reference} onChange={e=>setReference(e.target.value)} placeholder={type === "deposit" ? "Enter transaction reference" : "Enter receiving address"}/>
        <div className="notice">Requests are reviewed manually by AFGlion administration.</div>
        <button className="submit-request" type="submit">Continue</button>
      </form>}
    </div>
  </div>;
}
