#!/usr/bin/env elixir

Mix.install([:floki, :jason])
defmodule JsonPrettyPrinter do
  def get_stdin_data do
    :stdio
    |> IO.read(:eof)
    |> Jason.decode()
    |> case do
         {:ok, json_data} -> json_data
         _ -> raise "Invalid JSON payload was provided"
       end
  end

  def get_sups(html_el) do
    cond do
      is_list(html_el) ->
        Enum.map(html_el, fn el -> get_sups(el) end)
        |> List.flatten()
        
      is_tuple(html_el) and elem(html_el, 0) == "sup" ->
        elem(html_el, 2)
        
      is_tuple(html_el) ->
        Enum.map(elem(html_el, 2), fn el -> get_sups(el) end)
        |> List.flatten()
        
      true ->
        []
    end
  end

  def read_page(page) do
    page_num = page["page"]
    
    Enum.map(
      page["blocks"],
      fn block -> get_sups(Floki.parse_document!(block["html"])) end)
      |> List.flatten
      |> Jason.encode!
  end

  def get_footnotes(data) do
    bookname = List.first(Map.keys(data))

    read_page(Enum.at(data[bookname], 20))
    #    for page <- data[bookname] do
    #      read_page(page)
    #    end
  end
end

JsonPrettyPrinter.get_stdin_data()
|> JsonPrettyPrinter.get_footnotes()
|> IO.puts()
