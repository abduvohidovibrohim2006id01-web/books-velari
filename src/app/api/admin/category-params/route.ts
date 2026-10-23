import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

// GET /api/admin/category-params?category_id=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('category_id');

    if (!categoryId) {
      return NextResponse.json(
        { error: 'category_id query parameter is required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('category_params')
      .select('*')
      .eq('category_id', categoryId)
      .order('sort_order', { ascending: true });

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

// POST /api/admin/category-params
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { category_id, name, name_uz, name_ru, type, predefined_values, is_required, sort_order } = body;

    if (!category_id || !name || !type) {
      return NextResponse.json(
        { error: 'category_id, name, and type are required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('category_params')
      .insert({
        category_id,
        name,
        name_uz: name_uz || null,
        name_ru: name_ru || null,
        type,
        predefined_values: predefined_values || null,
        is_required: is_required ?? false,
        sort_order: sort_order ?? 0,
      })
      .select()
      .single();

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

// PUT /api/admin/category-params
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, predefined_values, ...otherFields } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      );
    }

    // If predefined_values is provided, merge with existing values
    let mergedPredefinedValues = undefined;

    if (predefined_values !== undefined) {
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from('category_params')
        .select('predefined_values')
        .eq('id', id)
        .single();

      if (fetchError) {
        return NextResponse.json({ error: fetchError.message }, { status: 500 });
      }

      const existingValues: any[] = existing?.predefined_values || [];
      const newValues: any[] = Array.isArray(predefined_values) ? predefined_values : [];

      // Merge: add new values that don't already exist
      const merged = [...existingValues];
      for (const val of newValues) {
        if (!merged.includes(val)) {
          merged.push(val);
        }
      }
      mergedPredefinedValues = merged;
    }

    const updatePayload: Record<string, any> = { ...otherFields };
    if (mergedPredefinedValues !== undefined) {
      updatePayload.predefined_values = mergedPredefinedValues;
    }

    const { data, error } = await supabaseAdmin
      .from('category_params')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

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

// DELETE /api/admin/category-params
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from('category_params')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
