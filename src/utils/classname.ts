const cx = (classNames: (string | undefined | null | boolean)[]) =>
  classNames.filter(Boolean).join(" ");

export { cx };
