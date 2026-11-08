import { useCallback, useState } from "react";

export const LIST_PAGE_SIZE = 25;

export function useListPage(scope: string) {
	const [state, setState] = useState({ scope, page: 1 });
	if (state.scope !== scope) setState({ scope, page: 1 });
	const page = state.scope === scope ? state.page : 1;
	return {
		page,
		offset: (page - 1) * LIST_PAGE_SIZE,
		setPage: useCallback((page: number) => setState({ scope, page }), [scope]),
	};
}
