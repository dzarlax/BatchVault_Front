export interface CookingIssue { code: string; message: string; field?: string; recipe_id?: number; product_id?: number }
export interface CookingComponent { recipe_id: number; quantity_g: string }
export interface CookingIngredientAmount { recipe_ingredient_id: number; ingredient_id: number; name: string; unit: string; quantity: string; type: string }
export interface CookingRecipeSnapshot { id: number; name: string; planned_yield_g?: string | null; base_recipe_ingredient_id: number; ingredients: CookingIngredientAmount[] }
export interface CookingProductSnapshot { id: number; name: string; net_weight_g: string; configuration_version: number; components: CookingComponent[] }
export interface CookingOrderLine { order_id: number; order_item_id: number; product_id: number; quantity: number }
export interface CookingFlavorPlan { recipe_id: number; name: string; target_finished_g: string; suggested_meat_g?: string | null; base_recipe_ingredient_id: number; recipe_snapshot: CookingRecipeSnapshot; issues: CookingIssue[] }
export interface CookingPlan { flavors: CookingFlavorPlan[]; products: CookingProductSnapshot[]; order_lines: CookingOrderLine[]; issues: CookingIssue[] }
export interface CookingExtraInput { recipe_id: number; finished_g: string }
export interface CookingStockUse { lot_id: number; quantity: string }
export interface CookingPlanInput { run_id?: number; order_ids: number[]; extras: CookingExtraInput[]; base_selections?: Record<string, number>; stock_uses?: CookingStockUse[]; acknowledged_run_ids?: number[] }
export interface CookingPlanPreview { plan: CookingPlan; source_signature: string; stock_version: number; active_runs: { id: number; title: string }[]; stock: CookingStock }
export interface CookingPreparedFlavor { recipe_id: number; name: string; actual_meat_g: string; expected_yield_g?: string | null; ingredients: CookingIngredientAmount[]; recipe_snapshot: CookingRecipeSnapshot }
export interface CookingPreparation { prepared_meat_g: string; allocated_meat_g: string; unallocated_meat_g: string; flavors: CookingPreparedFlavor[]; ingredients_total: CookingIngredientAmount[] }
export interface CookingPreparationInput { run_id?: number; recipe_id?: number; prepared_meat_g: string; flavors: { recipe_id: number; actual_meat_g: string; base_recipe_ingredient_id: number }[]; source_signature?: string; version?: number; operation_id?: string }
export interface CookingPackingLine { product_id: number; quantity: number }
export interface CookingPackingPreview { lines: CookingPackingLine[]; total_packs: number; consumption: CookingComponent[]; remaining: CookingComponent[] }
export interface CookingStockLot { id: number; run_id: number; kind: 'bulk' | 'packaged'; recipe_id?: number; product_id?: number; name: string; quantity: string; reserved: string; available: string; unit: 'g' | 'pcs'; composition: CookingComponent[]; configuration_version: number; created_at: string }
export interface CookingStock { version: number; lots: CookingStockLot[]; events?: CookingEvent[] }
export interface CookingEvent { id: number; kind: string; operation_id: string; created_at: string; payload: unknown }
export interface CookingRun { plan_input?: CookingPlanInput; id: number; title: string; date: string; state: 'draft' | 'prepared' | 'cooked' | 'archived'; version: number; source_signature: string; plan: CookingPlan; preparation?: CookingPreparation | null; actual_output: CookingComponent[]; events: CookingEvent[]; lots: CookingStockLot[]; stock_version: number; order_changes?: CookingIssue[] }
export interface CookingPackingInput { version: number; stock_version: number; operation_id: string; lines: CookingPackingLine[]; sources?: CookingStockUse[] }
export interface CookingResultInput { version: number; stock_version: number; operation_id: string; actual_usable_g: CookingComponent[]; packing?: { lines: CookingPackingLine[]; sources?: CookingStockUse[] } }
export interface CookingAdjustmentInput { operation_id: string; stock_version: number; kind: 'initial' | 'correction' | 'waste' | 'return'; reason: string; lot_id?: number; recipe_id?: number; product_id?: number; quantity: string; run_id?: number }
