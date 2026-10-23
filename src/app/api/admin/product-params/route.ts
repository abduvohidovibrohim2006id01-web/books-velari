import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

// GET /api/admin/product-params?product_id=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('product_id');

    if (!productId) {
      return NextResponse.json(
        { error: 'product_id query parameter is required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('product_param_values')
      .select('*, category_params(*)')
      .eq('product_id', productId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/admin/product-params
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { product_id, params } = body;

    if (!product_id || !Array.isArray(params) || params.length === 0) {
      return NextResponse.json(
        { error: 'product_id and a non-empty params array are required' },
        { status: 400 }
      );
    }

    const rows = params.map((p: { param_id: string; value?: string; value_uz?: string; value_ru?: string }) => ({
      product_id,
      param_id: p.param_id,
      value: p.value || p.value_uz || p.value_ru || '',
      value_uz: p.value_uz || p.value || '',
      value_ru: p.value_ru || p.value || '',
    }));

    const { data, error } = await supabaseAdmin
      .from('product_param_values')
      .upsert(rows, { onConflict: 'product_id,param_id' })
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
