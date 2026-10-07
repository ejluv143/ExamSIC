-- Join keys are seven characters from an alphabet without look-alikes (no 0/O, 1/I/L). Sessions with no key or
-- another kind of key get a new one.
DO $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  s record;
  k text;
BEGIN
  FOR s IN
    SELECT id FROM quiz_sessions
    WHERE join_code IS NULL OR join_code !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{7}$'
  LOOP
    LOOP
      k := '';
      FOR i IN 1..7 LOOP
        k := k || substr(alphabet, 1 + floor(random() * 31)::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM quiz_sessions WHERE join_code = k);
    END LOOP;
    UPDATE quiz_sessions SET join_code = k WHERE id = s.id;
  END LOOP;
END $$;
