---
name: add-hook
description: Create a new custom React hook following Second Mind patterns. Use when extracting reusable logic.
user-invocable: true
argument-hint: [hook name and purpose]
allowed-tools: Read, Grep, Glob, Edit, Write
---

# Add Hook to Second Mind

Hook: $ARGUMENTS

## Conventions

1. **File location:** `src/hooks/useHookName.ts` (or `.tsx` if it returns JSX)

2. **Pattern — data fetching hook** (like `useCloudData`):
```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useHookName(params: Params) {
  return useQuery({
    queryKey: ['hook-name', params],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('table')
        .select('*')
        .eq('column', params.value);
      if (error) throw error;
      return data;
    },
    enabled: !!params.value,
  });
}
```

3. **Pattern — side-effect hook** (like `useScheduledReminders`):
```typescript
import { useEffect, useCallback } from 'react';

export function useHookName() {
  const doWork = useCallback(() => {
    // logic here
  }, []);

  useEffect(() => {
    const interval = setInterval(doWork, 60000);
    return () => clearInterval(interval);
  }, [doWork]);
}
```

4. **Key integration points:**
   - Supabase client: `import { supabase } from '@/integrations/supabase/client'`
   - Auth state: `import { useAuth } from '@/contexts/AuthContext'`
   - Spaces/Items: `import { SpacesContext } from '@/contexts/SpacesContext'`
   - Toast feedback: `import { toast } from 'sonner'`

5. **Existing hooks to extend rather than duplicate:**
   - Data fetching → extend `useCloudData`
   - AI operations → extend `useAI`
   - Search → extend `useSemanticSearch`
