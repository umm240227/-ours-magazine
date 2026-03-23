"use client";

import { FormEvent, useState } from "react";

type ContactType = "記事について" | "広告掲載について" | "その他";

type ContactFormState = {
  name: string;
  email: string;
  inquiryType: ContactType;
  message: string;
};

const initialFormState: ContactFormState = {
  name: "",
  email: "",
  inquiryType: "記事について",
  message: "",
};

export default function ContactPage() {
  const [formData, setFormData] = useState<ContactFormState>(initialFormState);
  const [statusMessage, setStatusMessage] = useState("");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatusMessage("送信完了しました（※現在はテスト動作です）");
  }

  return (
    <section className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-extrabold text-brand-primary sm:text-4xl">お問い合わせ</h1>
      <p className="mt-4 text-sm leading-relaxed text-brand-primary/80 sm:text-base">
        記事に関するご質問や、広告掲載についてのご相談はこちらからお願いいたします。
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="space-y-2">
          <label htmlFor="contact-name" className="text-sm font-semibold text-brand-primary">
            お名前 <span className="text-red-500">*</span>
          </label>
          <input
            id="contact-name"
            name="name"
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-brand-primary outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
            placeholder="例）山田 太郎"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="contact-email" className="text-sm font-semibold text-brand-primary">
            メールアドレス <span className="text-red-500">*</span>
          </label>
          <input
            id="contact-email"
            name="email"
            type="email"
            required
            value={formData.email}
            onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-brand-primary outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
            placeholder="例）sample@example.com"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="contact-type" className="text-sm font-semibold text-brand-primary">
            お問い合わせ種別 <span className="text-red-500">*</span>
          </label>
          <select
            id="contact-type"
            name="inquiryType"
            required
            value={formData.inquiryType}
            onChange={(e) => setFormData((prev) => ({ ...prev, inquiryType: e.target.value as ContactType }))}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-brand-primary outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
          >
            <option value="記事について">記事について</option>
            <option value="広告掲載について">広告掲載について</option>
            <option value="その他">その他</option>
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="contact-message" className="text-sm font-semibold text-brand-primary">
            お問い合わせ内容 <span className="text-red-500">*</span>
          </label>
          <textarea
            id="contact-message"
            name="message"
            required
            value={formData.message}
            onChange={(e) => setFormData((prev) => ({ ...prev, message: e.target.value }))}
            className="min-h-40 w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-relaxed text-brand-primary outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
            placeholder="お問い合わせ内容をご入力ください。"
          />
        </div>

        <div className="space-y-3 pt-2">
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-md bg-brand-primary px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          >
            送信する
          </button>
          {statusMessage ? (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{statusMessage}</p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
